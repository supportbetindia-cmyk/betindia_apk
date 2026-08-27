// Win-back engine, layer 2: the segment builder.
//
// Reads the player_activity rollup and decides WHO gets a win-back bonus and HOW
// MUCH. The decision is a pure function (buildWinbackSegment) so it's fully
// unit-testable; getWinbackSegment() is the thin wrapper that fetches the rows
// and the cooldown list, then calls the pure core.
//
// This milestone only PREVIEWS the segment — nothing is sent here.

import type { PlayerActivityRow, PlayerTier } from './player-activity';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The approved Interakt template + the marker we tag win-back sends with (used by
// the cooldown lookup, and by the sender in the next milestone).
export const WINBACK_TEMPLATE = 'betindia_winback_bonus';
export const WINBACK_EVENT_TYPE = 'winback';

export type WinbackConfig = {
  minInactiveDays: number;   // must be quiet at least this long before we chase them
  maxInactiveDays: number;   // don't chase beyond this (also keeps us inside the value window)
  cooldownDays: number;      // don't re-message a player within this many days
  bonusByTier: Record<PlayerTier, number>; // ₹ bonus per tier; set 0 to disable a tier
};

export const DEFAULT_WINBACK_CONFIG: WinbackConfig = {
  minInactiveDays: 14,
  maxInactiveDays: 90,
  cooldownDays: 14,
  bonusByTier: { vip: 500, regular: 200, casual: 100 },
};

export type WinbackCandidate = {
  user_id: string;
  mobile: string;
  user_name: string | null;
  tier: PlayerTier;
  recencyDays: number;
  bonus: number;
};

// ---------------------------------------------------------------------------
// PURE: decide the segment. No I/O — unit-test this.
// ---------------------------------------------------------------------------

export function buildWinbackSegment(
  rows: PlayerActivityRow[],
  config: WinbackConfig,
  excludeUserIds: Set<string> = new Set(),
  now: number = Date.now(),
): WinbackCandidate[] {
  const candidates: WinbackCandidate[] = [];

  for (const row of rows) {
    if (!row.mobile) continue;                        // can't message without a number
    if (excludeUserIds.has(row.user_id)) continue;    // cooldown or opt-out

    const recencyDays = Math.floor((now - new Date(row.last_active_at).getTime()) / 86_400_000);
    if (recencyDays < config.minInactiveDays) continue; // still active — leave them alone
    if (recencyDays > config.maxInactiveDays) continue; // too far gone / beyond value window

    const bonus = config.bonusByTier[row.tier] ?? 0;
    if (bonus <= 0) continue;                          // this tier is switched off

    candidates.push({
      user_id: row.user_id,
      mobile: row.mobile,
      user_name: row.user_name,
      tier: row.tier,
      recencyDays,
      bonus,
    });
  }

  // Best players first, so any daily cap keeps the most valuable ones.
  const rank: Record<PlayerTier, number> = { vip: 3, regular: 2, casual: 1 };
  candidates.sort((a, b) => rank[b.tier] - rank[a.tier] || b.recencyDays - a.recencyDays);
  return candidates;
}

// ---------------------------------------------------------------------------
// Data layer: fetch rows + cooldown, then call the pure core.
// ---------------------------------------------------------------------------

function headers(): Record<string, string> {
  return { apikey: SERVICE_ROLE ?? '', Authorization: `Bearer ${SERVICE_ROLE}` };
}

/** Players whose last activity falls inside the [min, max] inactivity window. */
async function fetchInactivePlayers(config: WinbackConfig): Promise<PlayerActivityRow[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const oldestAllowed = new Date(Date.now() - config.maxInactiveDays * 86_400_000).toISOString();
  const newestAllowed = new Date(Date.now() - config.minInactiveDays * 86_400_000).toISOString();

  const params = new URLSearchParams({ select: '*', order: 'deposit_total_90d.desc' });
  params.append('last_active_at', `gte.${oldestAllowed}`); // not older than maxInactiveDays
  params.append('last_active_at', `lte.${newestAllowed}`); // not newer than minInactiveDays

  const res = await fetch(`${SUPABASE_URL}/rest/v1/player_activity?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`player_activity read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Players who already got a win-back message inside the cooldown window. */
async function fetchRecentlyMessaged(cooldownDays: number): Promise<Set<string>> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return new Set();
  const since = new Date(Date.now() - cooldownDays * 86_400_000).toISOString();
  const params = new URLSearchParams({
    select: 'user_id',
    event_type: `eq.${WINBACK_EVENT_TYPE}`,
    created_at: `gte.${since}`,
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/message_log?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) return new Set();
  const rows = await res.json() as Array<{ user_id: string | null }>;
  return new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)));
}

export type WinbackSegment = {
  candidates: WinbackCandidate[];
  totalBonus: number;
  byTier: Record<PlayerTier, number>;
};

/** Assemble the full preview: who we'd message, how many per tier, total bonus cost. */
export async function getWinbackSegment(config: WinbackConfig = DEFAULT_WINBACK_CONFIG): Promise<WinbackSegment> {
  const [rows, excluded] = await Promise.all([
    fetchInactivePlayers(config),
    fetchRecentlyMessaged(config.cooldownDays),
  ]);

  const candidates = buildWinbackSegment(rows, config, excluded);
  const byTier: Record<PlayerTier, number> = { vip: 0, regular: 0, casual: 0 };
  let totalBonus = 0;
  for (const c of candidates) {
    byTier[c.tier]++;
    totalBonus += c.bonus;
  }
  return { candidates, totalBonus, byTier };
}
