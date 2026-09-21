// Server-side user analytics built from the transactions + users tables (NOT the
// SDK analytics_events, which are empty). Everything here reads with the
// service_role key, so import ONLY from a route handler — never a client file.
//
// "Active" here means transaction activity (a deposit/withdrawal in the window),
// because that is the only per-user activity signal we currently have.
//
// Status classification checks REJECTED before APPROVED on purpose: the platform
// sends "reject_completed", which contains "complet" — so an approve-first regex
// (like storedReconciliation) would wrongly count rejected rows as approved.

import { getCurrentTenantId } from './tenant';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DAY_MS = 86_400_000;

/** True only for a settled/approved transaction. Rejected is checked first so
 * "reject_completed" (contains "complet") is never mistaken for approved. */
export function isApprovedStatus(status: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  if (/no statement|absent|reject|declin|fail|cancel/.test(s)) return false;
  return /approv|success|complet|credit/.test(s);
}

export type AnalyticsTxn = {
  type: 'deposit' | 'withdrawal';
  user_id: string | null;
  branch_id: string | null;
  user_name: string | null;
  mobile_number: string | null;
  amount: number | null;
  payment_status: string | null;
  remarks: string | null;
  created_at: string;
};

export type AnalyticsUser = {
  user_id: string;
  branch_id?: string | null;
  name: string | null;
  mobile: string | null;
  register_date: string | null;
  // CRM / User Master report financials (lifetime source of truth). Null when
  // this user was never synced from a report.
  first_deposit_date?: string | null;
  first_deposit_amount?: number | null;
  last_deposit_date?: string | null;
  last_withdrawal_date?: string | null;
  total_deposit?: number | null;
  deposit_count?: number | null;
  total_withdrawal?: number | null;
  withdrawal_count?: number | null;
  status_label?: string | null;
};

export type UserStatus = 'active' | 'lapsed' | 'dormant' | 'registered_only';

export type UserRow = {
  userId: string;
  branchId: string | null;   // Master / Branch ID from the platform
  name: string | null;
  mobile: string | null;
  registerDate: string | null;
  registered: boolean;        // present in the uploaded users table
  firstDepositAt: string | null;
  firstDepositAmount: number | null;
  depositCount: number;       // approved deposits
  depositTotal: number;       // approved deposit amount
  withdrawalCount: number;    // approved withdrawals
  withdrawalTotal: number;    // approved withdrawal amount
  pnl: number;                // depositTotal - withdrawalTotal (house net from this user)
  lastActivityAt: string | null;
  lastRemark: string | null;  // most recent transaction remark from the webhook API
  depositor: boolean;         // has >= 1 approved deposit
  status: UserStatus;
  fromReport: boolean;        // lifetime figures came from the CRM report, not webhook txns
  reportStatus: string | null; // platform Status label from the report, if any
};

export type UserAnalytics = {
  generatedAt: string;
  totals: {
    registeredUsers: number;
    depositors: number;
    ftdConversionPct: number;   // depositors / registeredUsers
    activeUsersToday: number;   // transacted since IST midnight today
    activeUsers7d: number;
    activeUsers30d: number;
    dormantDepositors: number;  // depositors with no activity in 30d+
    neverDeposited: number;     // registered users with no approved deposit
    newRegistrations7d: number;
    newRegistrations30d: number;
    depositTotal: number;
    withdrawalTotal: number;
    netPnl: number;
    avgFirstDeposit: number;
    todayDepositTotal: number;
    todayWithdrawalTotal: number;
  };
  users: UserRow[];
};

function newRow(userId: string): UserRow {
  return {
    userId,
    branchId: null,
    name: null,
    mobile: null,
    registerDate: null,
    registered: false,
    firstDepositAt: null,
    firstDepositAmount: null,
    depositCount: 0,
    depositTotal: 0,
    withdrawalCount: 0,
    withdrawalTotal: 0,
    pnl: 0,
    lastActivityAt: null,
    lastRemark: null,
    depositor: false,
    status: 'registered_only',
    fromReport: false,
    reportStatus: null,
  };
}

const IST_OFFSET_MS = 330 * 60_000;

/** IST (UTC+5:30) midnight of "today" for a given moment, as epoch ms. */
function istStartOfTodayMs(nowMs: number): number {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
}

/** YYYY-MM-DD of a moment in IST. */
function istDayString(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** A real platform branch/master id — not the synthetic statement-sync marker. */
function isRealBranch(b: string | null | undefined): b is string {
  return Boolean(b) && b !== 'statement-api' && !String(b).startsWith('statement:');
}

/** Pure aggregation: merge the users list with transaction rollups per user. */
export function buildUserAnalytics(
  users: AnalyticsUser[],
  txns: AnalyticsTxn[],
  nowMs = Date.now()
): UserAnalytics {
  const map = new Map<string, UserRow>();
  // Users whose lifetime figures come from the CRM report — for these we do NOT
  // also add webhook transaction amounts (that would double-count).
  const reportSeeded = new Set<string>();
  // Transaction-only "last activity" per user, used for the active-today/7d/30d
  // counts so they stay consistent with the transactions-based Active Users panel.
  const lastTxnAt = new Map<string, string>();

  const ensure = (userId: string): UserRow => {
    let row = map.get(userId);
    if (!row) { row = newRow(userId); map.set(userId, row); }
    return row;
  };

  const todayStartMs = istStartOfTodayMs(nowMs);
  // Today's approved deposit/withdrawal amounts — always from transactions (the
  // report is lifetime), independent of the report double-count guard below.
  let todayDepositTotal = 0;
  let todayWithdrawalTotal = 0;

  // Seed from the uploaded users table (registration + CRM report financials).
  for (const u of users) {
    if (!u.user_id) continue;
    const id = String(u.user_id);
    const row = ensure(id);
    row.registered = true;
    if (u.name && u.name !== '0') row.name = u.name; // "0" is a junk placeholder
    if (u.mobile) row.mobile = u.mobile;
    if (isRealBranch(u.branch_id)) row.branchId = u.branch_id;
    if (u.register_date) row.registerDate = u.register_date;

    // A report user is one with lifetime deposit figures from the platform.
    const hasReport = u.deposit_count != null || u.total_deposit != null || u.first_deposit_date != null;
    if (hasReport) {
      reportSeeded.add(id);
      row.fromReport = true;
      row.reportStatus = u.status_label ?? null;
      row.depositCount = u.deposit_count ?? 0;
      row.depositTotal = u.total_deposit ?? 0;
      row.withdrawalCount = u.withdrawal_count ?? 0;
      row.withdrawalTotal = u.total_withdrawal ?? 0;
      row.firstDepositAt = u.first_deposit_date ?? null;
      row.firstDepositAmount = u.first_deposit_amount ?? null;
      // Report gives a recency baseline; a newer webhook txn can override below.
      const reportLast = [u.last_deposit_date, u.last_withdrawal_date]
        .filter((d): d is string => Boolean(d))
        .sort()
        .at(-1) ?? null;
      row.lastActivityAt = reportLast;
    }
  }

  // Roll up transactions per user.
  for (const t of txns) {
    if (!t.user_id) continue;
    const id = String(t.user_id);
    const row = ensure(id);
    if ((!row.name || row.name === '0') && t.user_name && t.user_name !== '0') row.name = t.user_name;
    if (!row.mobile && t.mobile_number) row.mobile = t.mobile_number;
    if (!row.branchId && isRealBranch(t.branch_id)) row.branchId = t.branch_id;

    const ts = t.created_at;
    if (ts && (!row.lastActivityAt || ts > row.lastActivityAt)) row.lastActivityAt = ts;
    if (ts && (!lastTxnAt.get(id) || ts > (lastTxnAt.get(id) as string))) lastTxnAt.set(id, ts);
    // Txns arrive oldest-first, so the last remark we see is the most recent one.
    if (t.remarks && String(t.remarks).trim()) row.lastRemark = String(t.remarks).trim();

    if (!isApprovedStatus(t.payment_status)) continue;
    const amount = Number.isFinite(t.amount as number) ? Number(t.amount) : 0;

    // Today's totals count every approved txn today, report user or not.
    if (ts && new Date(ts).getTime() >= todayStartMs) {
      if (t.type === 'deposit') todayDepositTotal += amount;
      else todayWithdrawalTotal += amount;
    }

    // Report is the source of truth for lifetime figures — don't double-count.
    if (reportSeeded.has(id)) continue;

    if (t.type === 'deposit') {
      row.depositCount += 1;
      row.depositTotal += amount;
      if (ts && (!row.firstDepositAt || ts < row.firstDepositAt)) {
        row.firstDepositAt = ts;
        row.firstDepositAmount = amount;
      }
    } else {
      row.withdrawalCount += 1;
      row.withdrawalTotal += amount;
    }
  }

  let depositors = 0;
  let activeToday = 0;
  let active7 = 0;
  let active30 = 0;
  let dormantDepositors = 0;
  let neverDeposited = 0;
  let depositTotal = 0;
  let withdrawalTotal = 0;
  let ftdSum = 0;
  let ftdCount = 0;

  const out: UserRow[] = [];
  for (const row of map.values()) {
    row.pnl = row.depositTotal - row.withdrawalTotal;
    row.depositor = row.depositCount > 0;

    if (row.lastActivityAt) {
      const ageDays = (nowMs - new Date(row.lastActivityAt).getTime()) / DAY_MS;
      if (ageDays <= 7) row.status = 'active';
      else if (ageDays <= 30) row.status = 'lapsed';
      else row.status = 'dormant';
    } else {
      row.status = 'registered_only';
    }

    if (row.depositor) depositors += 1;
    // Active counts use transaction activity only (matches the Active Users panel).
    const txnTs = lastTxnAt.get(row.userId);
    if (txnTs) {
      const txnMs = new Date(txnTs).getTime();
      if (txnMs >= todayStartMs) activeToday += 1;
      const ageDays = (nowMs - txnMs) / DAY_MS;
      if (ageDays <= 7) active7 += 1;
      if (ageDays <= 30) active30 += 1;
    }
    if (row.depositor && row.status === 'dormant') dormantDepositors += 1;
    if (row.registered && !row.depositor) neverDeposited += 1;

    depositTotal += row.depositTotal;
    withdrawalTotal += row.withdrawalTotal;
    if (row.firstDepositAmount != null) { ftdSum += row.firstDepositAmount; ftdCount += 1; }

    out.push(row);
  }

  const registeredUsers = users.length;
  let new7 = 0;
  let new30 = 0;
  for (const u of users) {
    if (!u.register_date) continue;
    const ageDays = (nowMs - new Date(u.register_date).getTime()) / DAY_MS;
    if (ageDays <= 7) new7 += 1;
    if (ageDays <= 30) new30 += 1;
  }

  out.sort((a, b) => b.depositTotal - a.depositTotal || b.pnl - a.pnl);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    totals: {
      registeredUsers,
      depositors,
      ftdConversionPct: registeredUsers ? Math.round((depositors / registeredUsers) * 1000) / 10 : 0,
      activeUsersToday: activeToday,
      activeUsers7d: active7,
      activeUsers30d: active30,
      dormantDepositors,
      neverDeposited,
      newRegistrations7d: new7,
      newRegistrations30d: new30,
      depositTotal,
      withdrawalTotal,
      netPnl: depositTotal - withdrawalTotal,
      avgFirstDeposit: ftdCount ? Math.round(ftdSum / ftdCount) : 0,
      todayDepositTotal,
      todayWithdrawalTotal,
    },
    users: out,
  };
}

async function fetchAll<T>(pathAndQuery: string): Promise<T[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const pageSize = 1000;
  const all: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const url = `${SUPABASE_URL}/rest/v1/${pathAndQuery}${sep}limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

export type ReportFinancials = {
  first_deposit_date?: string | null;
  first_deposit_amount?: number | null;
  last_deposit_date?: string | null;
  last_deposit_amount?: number | null;
  last_withdrawal_date?: string | null;
  last_withdrawal_amount?: number | null;
  total_deposit?: number | null;
  deposit_count?: number | null;
  total_withdrawal?: number | null;
  withdrawal_count?: number | null;
  pnl?: number | null;
  total_bonus?: number | null;
  status_label?: string | null;
  category?: string | null;
};

export type ImportUserRow = {
  user_id: string;
  branch_id?: string | null;
  mobile?: string | null;
  name?: string | null;
  language?: string | null;
  register_date?: string | null;
  raw?: Record<string, unknown> | null;
  report?: ReportFinancials | null;
};

/** Upsert users into the users table, preserving the full CSV row in `raw`.
 * on_conflict=user_id + merge-duplicates so re-imports update instead of erroring. */
export async function importUserRows(rows: ImportUserRow[], tenantId: string = getCurrentTenantId()): Promise<number> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  let count = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows
      .slice(i, i + 500)
      .filter((u) => u.user_id && String(u.user_id).trim())
      .map((u) => {
        const r = u.report;
        return {
          user_id: String(u.user_id).trim(),
          branch_id: u.branch_id ?? null,
          mobile: u.mobile ?? null,
          name: u.name ?? null,
          language: u.language ?? null,
          register_date: u.register_date ?? null,
          raw: u.raw ?? null,
          tenant_id: tenantId,
          updated_at: new Date().toISOString(),
          // Only stamp CRM financial columns when the file carried them, so a
          // basic user upload never wipes previously-synced report data.
          ...(r ? {
            first_deposit_date: r.first_deposit_date ?? null,
            first_deposit_amount: r.first_deposit_amount ?? null,
            last_deposit_date: r.last_deposit_date ?? null,
            last_deposit_amount: r.last_deposit_amount ?? null,
            last_withdrawal_date: r.last_withdrawal_date ?? null,
            last_withdrawal_amount: r.last_withdrawal_amount ?? null,
            total_deposit: r.total_deposit ?? null,
            deposit_count: r.deposit_count ?? null,
            total_withdrawal: r.total_withdrawal ?? null,
            withdrawal_count: r.withdrawal_count ?? null,
            pnl: r.pnl ?? null,
            total_bonus: r.total_bonus ?? null,
            status_label: r.status_label ?? null,
            category: r.category ?? null,
            report_synced_at: new Date().toISOString(),
          } : {}),
        };
      });
    if (!batch.length) continue;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`users upsert ${res.status}: ${(await res.text()).slice(0, 200)}`);
    count += batch.length;
  }
  return count;
}

export type ActiveUsersResult = {
  total: number;
  series: { date: string; count: number }[]; // distinct active users per IST day
};

/** DISTINCT users with at least one transaction in [fromIso, toIso), plus a
 * per-day breakdown. Works for any window (incl. past custom ranges). */
export async function activeUsers(tenantId: string, fromIso: string, toIso: string): Promise<ActiveUsersResult> {
  const rows = await fetchAll<{ user_id: string | null; created_at: string }>(
    `transactions?select=user_id,created_at&tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${encodeURIComponent(fromIso)}&created_at=lt.${encodeURIComponent(toIso)}`
  );
  const all = new Set<string>();
  const byDay = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const id = String(r.user_id).trim();
    all.add(id);
    const day = istDayString(new Date(r.created_at).getTime());
    let set = byDay.get(day);
    if (!set) { set = new Set(); byDay.set(day, set); }
    set.add(id);
  }
  const series = [...byDay.entries()]
    .map(([date, set]) => ({ date, count: set.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { total: all.size, series };
}

/** Per-user breakdown scoped to a time window: each user's deposits, withdrawals,
 * P/L, first deposit and last activity computed ONLY from transactions in
 * [fromIso, toIso). Only users with activity in the window are returned. */
export async function fetchUserBreakdown(tenantId: string, fromIso: string, toIso: string, nowMs = Date.now()): Promise<UserRow[]> {
  const t = `&tenant_id=eq.${encodeURIComponent(tenantId)}`;
  const [users, txns] = await Promise.all([
    fetchAll<AnalyticsUser>(`users?select=user_id,branch_id,name,mobile,register_date${t}`),
    fetchAll<AnalyticsTxn>(
      `transactions?select=type,user_id,branch_id,user_name,mobile_number,amount,payment_status,remarks,created_at&created_at=gte.${encodeURIComponent(fromIso)}&created_at=lt.${encodeURIComponent(toIso)}&order=created_at.asc${t}`
    ),
  ]);
  const meta = new Map(users.map((u) => [String(u.user_id).trim(), u]));
  const map = new Map<string, UserRow>();

  for (const t of txns) {
    if (!t.user_id) continue;
    const id = String(t.user_id).trim();
    let row = map.get(id);
    if (!row) {
      row = newRow(id);
      const m = meta.get(id);
      if (m) { row.registered = true; row.name = m.name && m.name !== '0' ? m.name : null; row.mobile = m.mobile; row.registerDate = m.register_date; row.branchId = isRealBranch(m.branch_id) ? m.branch_id : null; }
      map.set(id, row);
    }
    if ((!row.name || row.name === '0') && t.user_name && t.user_name !== '0') row.name = t.user_name;
    if (!row.mobile && t.mobile_number) row.mobile = t.mobile_number;
    if (!row.branchId && isRealBranch(t.branch_id)) row.branchId = t.branch_id;

    const ts = t.created_at;
    if (ts && (!row.lastActivityAt || ts > row.lastActivityAt)) row.lastActivityAt = ts;
    if (t.remarks && String(t.remarks).trim()) row.lastRemark = String(t.remarks).trim();

    if (!isApprovedStatus(t.payment_status)) continue;
    const amount = Number.isFinite(t.amount as number) ? Number(t.amount) : 0;
    if (t.type === 'deposit') {
      row.depositCount += 1;
      row.depositTotal += amount;
      if (ts && (!row.firstDepositAt || ts < row.firstDepositAt)) { row.firstDepositAt = ts; row.firstDepositAmount = amount; }
    } else {
      row.withdrawalCount += 1;
      row.withdrawalTotal += amount;
    }
  }

  const out = [...map.values()];
  for (const row of out) {
    row.pnl = row.depositTotal - row.withdrawalTotal;
    row.depositor = row.depositCount > 0;
    if (row.lastActivityAt) {
      const ageDays = (nowMs - new Date(row.lastActivityAt).getTime()) / DAY_MS;
      row.status = ageDays <= 7 ? 'active' : ageDays <= 30 ? 'lapsed' : 'dormant';
    } else {
      row.status = 'registered_only';
    }
  }
  out.sort((a, b) => b.depositTotal - a.depositTotal || b.pnl - a.pnl);
  return out;
}

export type UserTxn = {
  id: number;
  type: 'deposit' | 'withdrawal';
  transaction_id: string | null;
  amount: number | null;
  payment_status: string | null;
  remarks: string | null;
  created_at: string;
  status: 'approved' | 'rejected' | 'pending';
};

function classifyStatus(status: string | null): UserTxn['status'] {
  const s = (status ?? '').toLowerCase();
  if (/no statement|absent|reject|declin|fail|cancel/.test(s)) return 'rejected';
  if (/approv|success|complet|credit/.test(s)) return 'approved';
  return 'pending';
}

/** All transactions for one user, newest first, with a normalised status. */
export async function fetchUserTransactions(tenantId: string, userId: string): Promise<UserTxn[]> {
  const rows = await fetchAll<Omit<UserTxn, 'status'>>(
    `transactions?select=id,type,transaction_id,amount,payment_status,remarks,created_at&tenant_id=eq.${encodeURIComponent(tenantId)}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
  );
  return rows.map((r) => ({ ...r, status: classifyStatus(r.payment_status) }));
}

export type MatchResult = {
  uploaded: number;   // rows received
  unique: number;     // distinct, non-empty ids
  existing: string[];  // ids already in the users table
  missing: string[];   // ids NOT in the users table
};

/** Diff an uploaded list of user IDs against the users table (the DB key). */
export async function matchUserIds(tenantId: string, ids: string[]): Promise<MatchResult> {
  const rows = await fetchAll<{ user_id: string }>(`users?select=user_id&tenant_id=eq.${encodeURIComponent(tenantId)}`);
  const known = new Set(rows.map((r) => String(r.user_id).trim()));

  const existing: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    (known.has(id) ? existing : missing).push(id);
  }
  return { uploaded: ids.length, unique: seen.size, existing, missing };
}

/** Fetch every user + transaction row FOR ONE TENANT and build the analytics. */
export async function fetchUserAnalytics(tenantId: string, nowMs = Date.now()): Promise<UserAnalytics> {
  const t = `&tenant_id=eq.${encodeURIComponent(tenantId)}`;
  const [users, txns] = await Promise.all([
    fetchAll<AnalyticsUser>(`users?select=user_id,branch_id,name,mobile,register_date,first_deposit_date,first_deposit_amount,last_deposit_date,last_withdrawal_date,total_deposit,deposit_count,total_withdrawal,withdrawal_count,status_label${t}`),
    fetchAll<AnalyticsTxn>(
      `transactions?select=type,user_id,branch_id,user_name,mobile_number,amount,payment_status,remarks,created_at&order=created_at.asc${t}`
    ),
  ]);
  return buildUserAnalytics(users, txns, nowMs);
}
