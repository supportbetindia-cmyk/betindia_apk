const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra = {}) {
  return { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, ...extra };
}

// Recency source: the single most recent transaction (any date).
async function fetchLatestTransaction(userId) {
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: 'created_at,user_name,mobile_number',
    order: 'created_at.desc',
    limit: '1',
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`latest txn read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows[0] ?? null;   // null = we've never seen this user
}

// Value source: deposits in the last N days.
async function fetchRecentDeposits(userId, sinceDays = 90) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    type: 'eq.deposit',
    created_at: `gte.${since}`,
    select: 'amount',
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`deposits read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();   // array of { amount }
}

async function upsertPlayerActivity(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/player_activity?on_conflict=user_id`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`upsert failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
}


export async function refreshPlayerActivity(userId) {
  const [latest, deposits] = await Promise.all([
    fetchLatestTransaction(userId),
    fetchRecentDeposits(userId),
  ]);
  if (!latest) return null;

  const lastActive = latest.created_at;
  const recencyDays = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86_400_000);
  const deposits90d = deposits.length;
  const depositTotal90d = deposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const { r, f, m, tier } = scoreRFM({
    recencyDays,
    frequency: deposits90d,
    monetary: depositTotal90d,
  });

  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    mobile: latest.mobile_number,
    user_name: latest.user_name,
    last_txn_at: lastActive,
    last_active_at: lastActive,        
    deposits_90d: deposits90d,
    deposit_total_90d: depositTotal90d,
    r_score: r, f_score: f, m_score: m, tier,
    refreshed_at: now,
    updated_at: now,
  };

  await upsertPlayerActivity(row);
  return row;
}