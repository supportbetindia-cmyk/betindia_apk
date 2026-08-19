import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRFM } from '../lib/player_activity.mjs';  // ✅


test('whale, still active → top scores, vip', () => {
  const out = scoreRFM({ recencyDays: 2, frequency: 12, monetary: 50000 });
  assert.deepEqual(out, { r: 3, f: 3, m: 3, value: 6, tier: 'vip' });
});

test('long-inactive VIP → low recency but still vip (prime win-back target)', () => {
  const out = scoreRFM({ recencyDays: 60, frequency: 8, monetary: 30000 });
  assert.equal(out.r, 1);        // inactive
  assert.equal(out.tier, 'vip'); // still valuable
});

test('one-time small depositor → casual', () => {
  const out = scoreRFM({ recencyDays: 45, frequency: 1, monetary: 500 });
  assert.equal(out.tier, 'casual');
});

test('brand-new / no deposits → lowest, casual', () => {
  const out = scoreRFM({ recencyDays: 400, frequency: 0, monetary: 0 });
  assert.deepEqual(out, { r: 1, f: 1, m: 1, value: 2, tier: 'casual' });
});

test('bad input does not crash', () => {
  const out = scoreRFM({ recencyDays: undefined, frequency: NaN, monetary: null });
  assert.equal(out.tier, 'casual');
});