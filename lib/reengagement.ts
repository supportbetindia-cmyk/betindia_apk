// Re-engagement engine, layer 1: classify each user and pick their audience.
//
// Two audiences:
//   - lapsed depositors  -> "win-back"      (they played, then went quiet)
//   - never-deposited     -> "first-deposit" (registered, never converted)
//
// classifyUser is PURE (no I/O, `now` passed in) so it's fully unit-testable.

export type UserActivityRow = {
  user_id: string;
  branch_id: string | null;
  mobile: string | null;
  name: string | null;
  language: string | null;
  register_date: string | null;
  last_txn_at: string | null;   // null = never transacted
  deposits_count: number;
};

export type ReengageConfig = {
  inactiveDays: number;       // lapsed if no transaction in this many days
  maxInactiveDays: number;    // don't chase lapsed players older than this
  minRegisterAgeDays: number; // only nudge never-deposited if registered at least this long ago
};

export const DEFAULT_REENGAGE_CONFIG: ReengageConfig = {
  inactiveDays: 7,
  maxInactiveDays: 90,
  minRegisterAgeDays: 7,
};

export type UserStatus = 'active' | 'lapsed' | 'never_deposited';
export type Audience = 'winback' | 'first_deposit' | null;

export type Classification = {
  status: UserStatus;
  audience: Audience;          // which campaign, or null if not a target right now
  inactiveDays: number | null; // days since last transaction (null if never)
};

const DAY = 86_400_000;

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((now - t) / DAY);
}

export function classifyUser(
  row: UserActivityRow,
  config: ReengageConfig,
  now: number = Date.now(),
): Classification {
  const inactiveDays = daysSince(row.last_txn_at, now);

  // Has transacted at least once -> active or lapsed.
  if (inactiveDays !== null) {
    if (inactiveDays < config.inactiveDays) {
      return { status: 'active', audience: null, inactiveDays };
    }
    // Lapsed. Target for win-back only within the chase window.
    const audience: Audience = inactiveDays <= config.maxInactiveDays ? 'winback' : null;
    return { status: 'lapsed', audience, inactiveDays };
  }

  // Never transacted. Nudge only once they've had a few days to convert on their own.
  const registerAgeDays = daysSince(row.register_date, now);
  const audience: Audience =
    registerAgeDays !== null && registerAgeDays >= config.minRegisterAgeDays ? 'first_deposit' : null;
  return { status: 'never_deposited', audience, inactiveDays: null };
}

// ---------------------------------------------------------------------------
// Data layer — no database view needed. We read `users` + `transactions` with
// the service_role key and join them in memory. (When console access is back we
// can swap this for the user_activity view for efficiency.)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(): Record<string, string> {
  return { apikey: SERVICE_ROLE ?? '', Authorization: `Bearer ${SERVICE_ROLE}` };
}

/** Read an entire table/query by paging 1000 rows at a time. */
async function fetchAllRows<T>(pathAndQuery: string): Promise<T[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const pageSize = 1000;
  const all: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const url = `${SUPABASE_URL}/rest/v1/${pathAndQuery}${sep}limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers: headers(), cache: 'no-store' });
    if (!res.ok) throw new Error(`read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json() as T[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

export type UserInput = {
  user_id: string;
  branch_id?: string | null;
  mobile: string | null;
  name?: string | null;
  language?: string | null;
  register_date: string | null;
};

type TxnLite = { user_id: string | null; type: string | null; created_at: string };
type TxnAgg = { last_txn_at: string; deposits_count: number };

/** Reduce all transactions to per-user { last_txn_at, deposits_count } in memory. */
async function fetchTransactionAggregate(): Promise<Map<string, TxnAgg>> {
  const rows = await fetchAllRows<TxnLite>('transactions?select=user_id,type,created_at');
  const map = new Map<string, TxnAgg>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const isDeposit = r.type === 'deposit';
    const cur = map.get(r.user_id);
    if (!cur) {
      map.set(r.user_id, { last_txn_at: r.created_at, deposits_count: isDeposit ? 1 : 0 });
    } else {
      if (new Date(r.created_at) > new Date(cur.last_txn_at)) cur.last_txn_at = r.created_at;
      if (isDeposit) cur.deposits_count++;
    }
  }
  return map;
}

/** Users already messaged by a campaign inside the cooldown window. */
async function fetchRecentlyMessaged(cooldownDays: number): Promise<Set<string>> {
  const since = new Date(Date.now() - cooldownDays * 86_400_000).toISOString();
  // Only SUCCESSFUL sends put a user on cooldown. Failed ones (e.g. WhatsApp
  // 131049 marketing cap) stay eligible so the next run retries them.
  const rows = await fetchAllRows<{ user_id: string | null }>(
    `message_log?select=user_id&event_type=in.(winback,first_deposit)&status=eq.sent&created_at=gte.${since}`,
  );
  return new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)));
}

export type CampaignConfig = ReengageConfig & {
  cooldownDays: number;
  winbackBonus: number;
  firstDepositBonus: number;
};

export const DEFAULT_CAMPAIGN_CONFIG: CampaignConfig = {
  ...DEFAULT_REENGAGE_CONFIG,
  cooldownDays: 14,
  winbackBonus: 200,
  firstDepositBonus: 100,
};

export type Candidate = {
  user_id: string;
  mobile: string;
  name: string | null;
  language: string | null;
  audience: 'winback' | 'first_deposit';
  inactiveDays: number | null;
  bonus: number;
};

export type ReengagementSegment = {
  winback: Candidate[];
  firstDeposit: Candidate[];
  counts: {
    users: number;
    active: number;
    lapsed: number;
    neverDeposited: number;
    winbackTargets: number;
    firstDepositTargets: number;
    skippedNoMobile: number;
    skippedCooldown: number;
  };
  totalBonus: number;
};

/** Read the user master list from a Supabase `users` table (for when it exists). */
export async function fetchUsersFromTable(): Promise<UserInput[]> {
  return fetchAllRows<UserInput>('users?select=user_id,branch_id,mobile,name,language,register_date');
}

/** Build both campaign audiences. `users` comes from wherever you have them —
 * a Supabase table OR (while locked out of the console) a parsed file. Only
 * `transactions` + `message_log` are read from Supabase here. */
export async function buildReengagementSegment(
  users: UserInput[],
  config: CampaignConfig = DEFAULT_CAMPAIGN_CONFIG,
  now: number = Date.now(),
): Promise<ReengagementSegment> {
  const [txnAgg, cooldown] = await Promise.all([
    fetchTransactionAggregate(),
    fetchRecentlyMessaged(config.cooldownDays),
  ]);

  const winback: Candidate[] = [];
  const firstDeposit: Candidate[] = [];
  const counts = {
    users: users.length,
    active: 0, lapsed: 0, neverDeposited: 0,
    winbackTargets: 0, firstDepositTargets: 0,
    skippedNoMobile: 0, skippedCooldown: 0,
  };

  for (const u of users) {
    const agg = txnAgg.get(u.user_id);
    const c = classifyUser(
      {
        user_id: u.user_id,
        branch_id: u.branch_id ?? null,
        mobile: u.mobile,
        name: u.name ?? null,
        language: u.language ?? null,
        register_date: u.register_date,
        last_txn_at: agg?.last_txn_at ?? null,
        deposits_count: agg?.deposits_count ?? 0,
      },
      config,
      now,
    );

    if (c.status === 'active') counts.active++;
    else if (c.status === 'lapsed') counts.lapsed++;
    else counts.neverDeposited++;

    if (!c.audience) continue;
    if (!u.mobile) { counts.skippedNoMobile++; continue; }
    if (cooldown.has(u.user_id)) { counts.skippedCooldown++; continue; }

    const candidate: Candidate = {
      user_id: u.user_id,
      mobile: u.mobile,
      name: u.name ?? null,
      language: u.language ?? null,
      audience: c.audience,
      inactiveDays: c.inactiveDays,
      bonus: c.audience === 'winback' ? config.winbackBonus : config.firstDepositBonus,
    };
    if (c.audience === 'winback') { winback.push(candidate); counts.winbackTargets++; }
    else { firstDeposit.push(candidate); counts.firstDepositTargets++; }
  }

  const totalBonus =
    winback.reduce((s, c) => s + c.bonus, 0) + firstDeposit.reduce((s, c) => s + c.bonus, 0);

  return { winback, firstDeposit, counts, totalBonus };
}
