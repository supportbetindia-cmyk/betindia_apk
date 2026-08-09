import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseStatementDate,
  reconcileUserTransactions,
} from '../lib/transaction-reconciliation.ts';

const txn = (overrides = {}) => ({
  id: 1,
  type: 'deposit',
  amount: 500,
  payment_status: null,
  created_at: '2026-08-08T03:22:00.000Z',
  ...overrides,
});

const entry = (overrides = {}) => ({
  description: 'Wallet Deposit',
  pnl: '500',
  date: '2026-08-08 08:51:43',
  type: 'auto_deposit',
  ...overrides,
});

const FOUR_HOURS_LATER = Date.parse('2026-08-08T07:22:00.000Z');

test('parses provider statement timestamps as India time', () => {
  assert.equal(
    parseStatementDate('2026-08-08 08:51:43'),
    Date.parse('2026-08-08T03:21:43.000Z')
  );
});

test('confirms a matching settled deposit', () => {
  const [result] = reconcileUserTransactions([txn()], [entry()]);
  assert.equal(result.display_status, 'approved');
  assert.equal(result.status_source, 'statement');
  assert.equal(result.status_label, 'Approved · statement');
});

test('ignores bonus deposits when reconciling cash deposits', () => {
  const [result] = reconcileUserTransactions(
    [txn()],
    [entry({ type: 'bonus_deposit', description: 'Earn Bonus' })],
    { nowMs: FOUR_HOURS_LATER }
  );
  assert.equal(result.display_status, 'unconfirmed');
});

test('uses each statement entry only once for duplicate amounts', () => {
  const results = reconcileUserTransactions([
    txn({ id: 1 }),
    txn({ id: 2, created_at: '2026-08-08T03:23:00.000Z' }),
  ], [entry()], { nowMs: FOUR_HOURS_LATER });
  assert.equal(results.filter((item) => item.display_status === 'approved').length, 1);
  assert.equal(results.filter((item) => item.display_status === 'unconfirmed').length, 1);
});

test('preserves explicit webhook rejection even if a similar statement entry exists', () => {
  const [result] = reconcileUserTransactions([
    txn({ payment_status: 'Rejected' }),
  ], [entry()]);
  assert.equal(result.display_status, 'rejected');
  assert.equal(result.status_source, 'webhook');
});

test('matches settled withdrawals using the absolute negative pnl', () => {
  const [result] = reconcileUserTransactions([
    txn({ type: 'withdrawal', amount: 1948 }),
  ], [entry({ type: 'auto_withdrawal', description: 'Wallet Withdraw', pnl: '-1948' })]);
  assert.equal(result.display_status, 'approved');
  assert.equal(result.status_source, 'statement');
});

test('does not confirm a same-amount entry outside the time window', () => {
  const [result] = reconcileUserTransactions([
    txn(),
  ], [entry({ date: '2026-08-06 08:51:43' })], { nowMs: FOUR_HOURS_LATER });
  assert.equal(result.display_status, 'unconfirmed');
});

test('keeps an unmatched deposit unconfirmed during the five-hour grace period', () => {
  const [result] = reconcileUserTransactions([txn()], [], { nowMs: FOUR_HOURS_LATER });
  assert.equal(result.display_status, 'unconfirmed');
});

test('rejects an unmatched deposit after five hours under the final-API rule', () => {
  const [result] = reconcileUserTransactions([txn()], [], {
    nowMs: Date.parse('2026-08-08T08:22:00.000Z'),
  });
  assert.equal(result.display_status, 'rejected');
  assert.equal(result.status_source, 'statement_absence');
  assert.equal(result.status_label, 'Rejected · absent from final API after 5h');
});

test('does not infer rejection for an unmatched withdrawal', () => {
  const [result] = reconcileUserTransactions([
    txn({ type: 'withdrawal' }),
  ], [], { nowMs: Date.parse('2026-08-09T03:22:00.000Z') });
  assert.equal(result.display_status, 'unconfirmed');
});

test('recognizes statement statuses saved by the background sync', () => {
  const [approved] = reconcileUserTransactions([
    txn({ payment_status: 'Approved - statement @ 2026-08-08 08:51:43' }),
  ], [entry()]);
  const [rejected] = reconcileUserTransactions([
    txn({ payment_status: 'Rejected - no statement after 5h' }),
  ], []);
  assert.equal(approved.status_source, 'statement');
  assert.equal(approved.status_label, 'Approved · statement');
  assert.equal(rejected.status_source, 'statement_absence');
  assert.equal(rejected.display_status, 'rejected');
  assert.equal(rejected.status_label, 'Rejected · absent from final API after 5h');
});

test('does not reuse a legacy saved approval for a second same-amount request', () => {
  const results = reconcileUserTransactions([
    txn({ id: 1, payment_status: 'Approved - statement' }),
    txn({ id: 2, created_at: '2026-08-08T03:23:00.000Z' }),
  ], [entry()], { nowMs: Date.parse('2026-08-08T09:00:00.000Z') });
  assert.equal(results.filter((item) => item.display_status === 'approved').length, 1);
  assert.equal(results.filter((item) => item.display_status === 'rejected').length, 1);
});

test('clears a legacy reused approval while the request is still in its grace period', () => {
  const [result] = reconcileUserTransactions([
    txn({ payment_status: 'Approved - statement' }),
  ], [], { nowMs: FOUR_HOURS_LATER });
  assert.equal(result.display_status, 'unconfirmed');
  assert.equal(result.status_source, 'none');
});

test('reserves an approval already attached to its exact statement entry', () => {
  const results = reconcileUserTransactions([
    txn({ id: 1, payment_status: 'Approved - statement @ 2026-08-08 08:51:43' }),
    txn({ id: 2, created_at: '2026-08-08T03:23:00.000Z' }),
  ], [entry()], { nowMs: Date.parse('2026-08-08T09:00:00.000Z') });
  assert.equal(results[0].display_status, 'approved');
  assert.equal(results[0].statement_date, '2026-08-08 08:51:43');
  assert.equal(results[1].display_status, 'rejected');
});
