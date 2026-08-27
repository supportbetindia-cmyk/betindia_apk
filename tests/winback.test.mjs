import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWinbackSegment, DEFAULT_WINBACK_CONFIG } from '../lib/winback.ts';

const NOW = Date.UTC(2026, 0, 100); // fixed clock so tests are deterministic

// Small factory: a player_activity row `daysAgo` days inactive.
function player(over = {}) {
  const daysAgo = over.daysAgo ?? 30;
  const at = new Date(NOW - daysAgo * 86_400_000).toISOString();
  return {
    user_id: over.user_id ?? 'u1',
    mobile: 'mobile' in over ? over.mobile : '9800000000',
    user_name: over.user_name ?? 'Test',
    last_txn_at: at,
    last_active_at: at,
    deposits_90d: 5,
    deposit_total_90d: 10000,
    r_score: 1, f_score: 2, m_score: 2,
    tier: over.tier ?? 'regular',
    refreshed_at: at,
  };
}

test('includes an inactive player and assigns the tier bonus', () => {
  const out = buildWinbackSegment([player({ daysAgo: 30, tier: 'vip' })], DEFAULT_WINBACK_CONFIG, new Set(), NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].bonus, 500);      // vip bonus
  assert.equal(out[0].recencyDays, 30);
});

test('excludes a still-active player (below minInactiveDays)', () => {
  const out = buildWinbackSegment([player({ daysAgo: 5 })], DEFAULT_WINBACK_CONFIG, new Set(), NOW);
  assert.equal(out.length, 0);
});

test('excludes a too-far-gone player (beyond maxInactiveDays)', () => {
  const out = buildWinbackSegment([player({ daysAgo: 120 })], DEFAULT_WINBACK_CONFIG, new Set(), NOW);
  assert.equal(out.length, 0);
});

test('excludes players on cooldown', () => {
  const out = buildWinbackSegment([player({ user_id: 'u9' })], DEFAULT_WINBACK_CONFIG, new Set(['u9']), NOW);
  assert.equal(out.length, 0);
});

test('excludes players with no mobile number', () => {
  const out = buildWinbackSegment([player({ mobile: null })], DEFAULT_WINBACK_CONFIG, new Set(), NOW);
  assert.equal(out.length, 0);
});

test('skips a tier whose bonus is set to 0', () => {
  const config = { ...DEFAULT_WINBACK_CONFIG, bonusByTier: { vip: 500, regular: 0, casual: 100 } };
  const out = buildWinbackSegment([player({ tier: 'regular' })], config, new Set(), NOW);
  assert.equal(out.length, 0);
});

test('sorts VIPs before regulars before casuals', () => {
  const rows = [
    player({ user_id: 'c', tier: 'casual' }),
    player({ user_id: 'v', tier: 'vip' }),
    player({ user_id: 'r', tier: 'regular' }),
  ];
  const out = buildWinbackSegment(rows, DEFAULT_WINBACK_CONFIG, new Set(), NOW);
  assert.deepEqual(out.map((c) => c.user_id), ['v', 'r', 'c']);
});
