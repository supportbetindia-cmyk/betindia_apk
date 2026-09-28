import assert from 'node:assert/strict';
import test from 'node:test';
import { isRealMaster, parseMasterId, scopeMasterRows, withMaster } from '../lib/master-filter.ts';

test('master query parameters are preserved and validated', () => {
  assert.equal(withMaster('/customers?page=2', 'M/1'), '/customers?page=2&masterId=M%2F1');
  assert.equal(parseMasterId(new URLSearchParams('masterId=M1')), 'M1');
  assert.equal(parseMasterId(new URLSearchParams()), undefined);
  assert.throws(() => parseMasterId(new URLSearchParams('masterId=M1&masterId=M2')), /single ID/);
  assert.throws(() => parseMasterId(new URLSearchParams(`masterId=${'x'.repeat(129)}`)), /128/);
});

test('master scope uses customer assignment and transaction fallback', () => {
  const users = [
    { user_id: 'u1', branch_id: 'A' },
    { user_id: 'u2', branch_id: null },
  ];
  const transactions = [
    { user_id: 'u1', branch_id: 'wrong' },
    { user_id: 'u2', branch_id: 'A' },
    { user_id: 'u3', branch_id: 'A' },
  ];
  const scoped = scopeMasterRows(users, transactions, 'A');
  assert.deepEqual(scoped.users.map((u) => u.user_id), ['u1', 'u2']);
  assert.deepEqual(scoped.transactions.map((t) => t.user_id), ['u1', 'u2', 'u3']);
  assert.equal(isRealMaster('statement-api'), false);
  assert.equal(isRealMaster('A'), true);
});
