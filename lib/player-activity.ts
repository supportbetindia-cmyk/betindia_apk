

import { fetchKnownTransactionUserIds } from './wati';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;


export type RfmInput = { recencyDays: number; frequency: number; monetary: number };
export type PlayerTier = 'vip' | 'regular' | 'casual';
export type RfmResult = { r: number; f: number; m: number; value: number; tier: PlayerTier };

export function scoreRFM({ recencyDays, frequency, monetary }: RfmInput): RfmResult {
  const days = Number.isFinite(recencyDays) ? Math.max(0, recencyDays) : Infinity;
  const freq = Number.isFinite(frequency) ? Math.max(0, frequency) : 0;
  const money = Number.isFinite(monetary) ? Math.max(0, monetary) : 0;

  const r = days <= 7 ? 3 : days <= 30 ? 2 : 1;         
  const f = freq >= 10 ? 3 : freq >= 3 ? 2 : 1;          
  const m = money >= 20000 ? 3 : money >= 5000 ? 2 : 1;  

  const value = f + m;                                  
  const tier: PlayerTier = value >= 5 ? 'vip' : value >= 3 ? 'regular' : 'casual';
  return { r, f, m, value, tier };
}



function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: SERVICE_ROLE ?? '', Authorization: `Bearer ${SERVICE_ROLE}`, ...extra };
}

function requireSupabase(): string {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  return SUPABASE_URL;
}

type LatestTxn = { created_at: string; user_name: string | null; mobile_number: string | null };


async function fetchLatestTransaction(url: string, userId: string): Promise<LatestTxn | null> {
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: 'created_at,user_name,mobile_number',
    order: 'created_at.desc',
    limit: '1',
  });
  const res = await fetch(`${url}/rest/v1/transactions?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`latest txn read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json() as LatestTxn[];
  return rows[0] ?? null;
}


async function fetchRecentDeposits(url: string, userId: string, sinceDays = 90): Promise<Array<{ amount: number | string | null }>> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    type: 'eq.deposit',
    created_at: `gte.${since}`,
    select: 'amount',
  });
  const res = await fetch(`${url}/rest/v1/transactions?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`deposits read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}


export type PlayerActivityRow = {
  user_id: string;
  mobile: string | null;
  user_name: string | null;
  last_txn_at: string;
  last_active_at: string;
  deposits_90d: number;
  deposit_total_90d: number;
  r_score: number;
  f_score: number;
  m_score: number;
  tier: PlayerTier;
  refreshed_at: string;
};

async function upsertPlayerActivity(url: string, row: PlayerActivityRow): Promise<void> {
  const res = await fetch(`${url}/rest/v1/player_activity?on_conflict=user_id`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`player_activity upsert failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
}


export async function refreshPlayerActivity(userId: string): Promise<PlayerActivityRow | null> {
  const url = requireSupabase();
  const [latest, deposits] = await Promise.all([
    fetchLatestTransaction(url, userId),
    fetchRecentDeposits(url, userId),
  ]);
  if (!latest) return null;

  const lastActive = latest.created_at;
  const recencyDays = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86_400_000);
  const deposits90d = deposits.length;
  const depositTotal90d = deposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const { r, f, m, tier } = scoreRFM({ recencyDays, frequency: deposits90d, monetary: depositTotal90d });

  const row: PlayerActivityRow = {
    user_id: userId,
    mobile: latest.mobile_number,
    user_name: latest.user_name,
    last_txn_at: lastActive,
    last_active_at: lastActive, 
    deposits_90d: deposits90d,
    deposit_total_90d: depositTotal90d,
    r_score: r,
    f_score: f,
    m_score: m,
    tier,
    refreshed_at: new Date().toISOString(),
  };

  await upsertPlayerActivity(url, row);
  return row;
}


async function mapWithConcurrency<T>(items: T[], lanes: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(lanes, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function refreshAllPlayers(
  options: { limit?: number; concurrency?: number } = {},
): Promise<{ total: number; refreshed: number; failed: number }> {
  const ids = await fetchKnownTransactionUserIds();
  const selected = options.limit ? ids.slice(0, options.limit) : ids;
  let refreshed = 0;
  let failed = 0;

  await mapWithConcurrency(selected, options.concurrency ?? 5, async (userId) => {
    try {
      await refreshPlayerActivity(userId);
      refreshed++;
    } catch {
      failed++; 
    }
  });

  return { total: selected.length, refreshed, failed };
}
