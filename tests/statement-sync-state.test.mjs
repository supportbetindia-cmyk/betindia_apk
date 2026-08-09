import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceStatementSyncCursor,
  selectStatementSyncBatch,
} from '../lib/statement-sync-state.ts';

test('selects unique users in stable alphabetical batches', () => {
  const batch = selectStatementSyncBatch(['c', 'a', 'b', 'a'], {
    lastUserId: null,
    cycleProcessed: 0,
    completedCycles: 0,
  }, 2);
  assert.deepEqual(batch.users, ['a', 'b']);
  assert.equal(batch.reachedEnd, false);
});

test('continues after the saved user and completes a cycle', () => {
  const cursor = { lastUserId: 'b', cycleProcessed: 2, completedCycles: 0 };
  const batch = selectStatementSyncBatch(['a', 'b', 'c'], cursor, 2);
  assert.deepEqual(batch.users, ['c']);
  assert.deepEqual(advanceStatementSyncCursor(cursor, batch), {
    lastUserId: null,
    cycleProcessed: 0,
    completedCycles: 1,
  });
});

test('starts a fresh pass after a completed cycle', () => {
  const batch = selectStatementSyncBatch(['a', 'b'], {
    lastUserId: null,
    cycleProcessed: 0,
    completedCycles: 1,
  }, 1);
  assert.deepEqual(batch.users, ['a']);
});

