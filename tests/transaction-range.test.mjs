import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterTransactionRows,
  parseTransactionRange,
  resolveTransactionRange,
} from '../lib/transaction-range.ts';

const now = Date.parse('2026-08-08T16:30:00.000Z'); // 22:00 IST

test('transaction periods default safely to today', () => {
  assert.equal(parseTransactionRange('not-a-range'), 'today');
  assert.equal(parseTransactionRange(null), 'today');
});

test('today and yesterday use India calendar boundaries', () => {
  const today = resolveTransactionRange('today', now);
  const yesterday = resolveTransactionRange('yesterday', now);

  assert.equal(today.from, Date.parse('2026-08-07T18:30:00.000Z'));
  assert.equal(today.to, now);
  assert.equal(yesterday.from, Date.parse('2026-08-06T18:30:00.000Z'));
  assert.equal(yesterday.to, Date.parse('2026-08-07T18:30:00.000Z'));
});

test('filters transaction rows to the selected period', () => {
  const rows = [
    { id: 1, created_at: '2026-08-08T10:00:00.000Z' },
    { id: 2, created_at: '2026-08-07T10:00:00.000Z' },
    { id: 3, created_at: '2026-07-01T10:00:00.000Z' },
  ];

  assert.deepEqual(filterTransactionRows(rows, 'today', now).map((row) => row.id), [1]);
  assert.deepEqual(filterTransactionRows(rows, 'yesterday', now).map((row) => row.id), [2]);
  assert.deepEqual(filterTransactionRows(rows, 'all', now).map((row) => row.id), [1, 2, 3]);
});
