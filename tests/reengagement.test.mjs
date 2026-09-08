import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUser, DEFAULT_REENGAGE_CONFIG } from '../lib/reengagement.ts';

const NOW = Date.UTC(2026, 0, 100);

function user(over = {}) {
  return {
    user_id: over.user_id ?? 'u1',
    branch_id: 'b1',
    mobile: over.mobile ?? '9800000000',
    name: 'Test',
    language: 'en',
    register_date: 'register_date' in over ? over.register_date : new Date(NOW - 30 * 86_400_000).toISOString(),
    last_txn_at: 'last_txn_at' in over ? over.last_txn_at : null,
    deposits_count: over.deposits_count ?? 0,
  };
}

function daysAgo(n) {
  return new Date(NOW - n * 86_400_000).toISOString();
}

test('recent depositor -> active, no campaign', () => {
  const c = classifyUser(user({ last_txn_at: daysAgo(2), deposits_count: 3 }), DEFAULT_REENGAGE_CONFIG, NOW);
  assert.deepEqual(c, { status: 'active', audience: null, inactiveDays: 2 });
});

test('lapsed within window -> win-back', () => {
  const c = classifyUser(user({ last_txn_at: daysAgo(20), deposits_count: 5 }), DEFAULT_REENGAGE_CONFIG, NOW);
  assert.equal(c.status, 'lapsed');
  assert.equal(c.audience, 'winback');
  assert.equal(c.inactiveDays, 20);
});

test('lapsed but too far gone -> no campaign', () => {
  const c = classifyUser(user({ last_txn_at: daysAgo(200), deposits_count: 5 }), DEFAULT_REENGAGE_CONFIG, NOW);
  assert.equal(c.status, 'lapsed');
  assert.equal(c.audience, null);
});

test('never deposited, registered a while ago -> first-deposit', () => {
  const c = classifyUser(user({ last_txn_at: null, register_date: daysAgo(30) }), DEFAULT_REENGAGE_CONFIG, NOW);
  assert.deepEqual(c, { status: 'never_deposited', audience: 'first_deposit', inactiveDays: null });
});

test('never deposited but just registered -> give them time, no campaign', () => {
  const c = classifyUser(user({ last_txn_at: null, register_date: daysAgo(2) }), DEFAULT_REENGAGE_CONFIG, NOW);
  assert.equal(c.audience, null);
});

test('exactly at the 7-day threshold counts as lapsed', () => {
  const c = classifyUser(user({ last_txn_at: daysAgo(7), deposits_count: 1 }), DEFAULT_REENGAGE_CONFIG, NOW);
  assert.equal(c.status, 'lapsed');
  assert.equal(c.audience, 'winback');
});
