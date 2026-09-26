// Growth engine: compare a metric across two periods and return Growth % / X.
// Server-only (service_role key). Period deposits/withdrawals/active come from
// the transactions table; registrations/FTD come from the users table dates.

import { scopeMasterRows } from './master-filter';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Self-contained approved check (rejected-first, so "reject_completed" isn't approved). */
function isApprovedStatus(status: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  if (/no statement|absent|reject|declin|fail|cancel/.test(s)) return false;
  return /approv|success|complet|credit/.test(s);
}

async function fetchAll<T>(pathAndQuery: string): Promise<T[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const pageSize = 1000;
  const all: T[] = [];
  for (let off = 0; ; off += pageSize) {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}${sep}limit=${pageSize}&offset=${off}`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`read ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

export type PeriodMetrics = {
  newCustomers: number;
  ftd: number;
  activeCustomers: number;
  deposits: number;
  withdrawals: number;
  pnl: number;
};

export type MetricFormat = 'count' | 'money';
export type GrowthState = 'OK' | 'NEW_BASE' | 'FLAT';
export type GrowthMetric = {
  key: keyof PeriodMetrics;
  label: string;
  format: MetricFormat;
  current: number;
  previous: number;
  pct: number | null;   // null when NEW_BASE
  x: number | null;     // null when NEW_BASE / FLAT
  state: GrowthState;
};

export type GrowthResult = {
  label: string;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  metrics: GrowthMetric[];
};

type UserLite = { user_id: string; branch_id: string | null; register_date: string | null; first_deposit_date: string | null };
type TxnLite = { user_id: string | null; branch_id: string | null; type: 'deposit' | 'withdrawal'; amount: number | null; payment_status: string | null; created_at: string };

const inRange = (iso: string | null, a: number, b: number): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= a && t < b;
};

function growth(cur: number, prev: number): { pct: number | null; x: number | null; state: GrowthState } {
  if (prev === 0 && cur === 0) return { pct: 0, x: null, state: 'FLAT' };
  if (prev === 0) return { pct: null, x: null, state: 'NEW_BASE' };
  return { pct: Math.round(((cur - prev) / prev) * 1000) / 10, x: Math.round((cur / prev) * 100) / 100, state: 'OK' };
}

export async function computeGrowth(tenantId: string, fromIso: string, toIso: string, prevFromIso: string, prevToIso: string, label = '', masterId?: string): Promise<GrowthResult> {
  const from = Date.parse(fromIso), to = Date.parse(toIso), pf = Date.parse(prevFromIso), pt = Date.parse(prevToIso);
  const lo = new Date(Math.min(from, pf)).toISOString();
  const hi = new Date(Math.max(to, pt)).toISOString();
  const tf = `&tenant_id=eq.${encodeURIComponent(tenantId)}`;

  const [allUsers, allTxns] = await Promise.all([
    fetchAll<UserLite>(`users?select=user_id,branch_id,register_date,first_deposit_date${tf}`),
    fetchAll<TxnLite>(`transactions?select=user_id,branch_id,type,amount,payment_status,created_at&created_at=gte.${encodeURIComponent(lo)}&created_at=lt.${encodeURIComponent(hi)}${tf}`),
  ]);
  const { users, transactions: txns } = scopeMasterRows(allUsers, allTxns, masterId);

  const calc = (a: number, b: number): PeriodMetrics => {
    let newCustomers = 0, ftd = 0;
    for (const u of users) {
      if (inRange(u.register_date, a, b)) newCustomers += 1;
      if (inRange(u.first_deposit_date, a, b)) ftd += 1;
    }
    let deposits = 0, withdrawals = 0;
    const active = new Set<string>();
    for (const t of txns) {
      const ts = new Date(t.created_at).getTime();
      if (!(ts >= a && ts < b)) continue;
      if (t.user_id) active.add(t.user_id);
      if (!isApprovedStatus(t.payment_status)) continue;
      const amt = Number.isFinite(t.amount as number) ? Number(t.amount) : 0;
      if (t.type === 'deposit') deposits += amt; else withdrawals += amt;
    }
    return { newCustomers, ftd, activeCustomers: active.size, deposits, withdrawals, pnl: deposits - withdrawals };
  };

  const current = calc(from, to);
  const previous = calc(pf, pt);

  const defs: Array<{ key: keyof PeriodMetrics; label: string; format: MetricFormat }> = [
    { key: 'newCustomers', label: 'New Customers', format: 'count' },
    { key: 'ftd', label: 'First Deposits (FTD)', format: 'count' },
    { key: 'activeCustomers', label: 'Active Customers', format: 'count' },
    { key: 'deposits', label: 'Deposits', format: 'money' },
    { key: 'withdrawals', label: 'Withdrawals', format: 'money' },
    { key: 'pnl', label: 'Net P/L', format: 'money' },
  ];

  const metrics: GrowthMetric[] = defs.map(({ key, label: l, format }) => {
    const cur = current[key], prev = previous[key];
    return { key, label: l, format, current: cur, previous: prev, ...growth(cur, prev) };
  });

  return { label, current, previous, metrics };
}
