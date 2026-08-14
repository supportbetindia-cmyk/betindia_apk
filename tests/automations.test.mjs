import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automationEventKey,
  buildAutomationMessage,
  normalizePhone,
} from '../lib/automation-message.ts';

test('creates the same event key for a retried transaction webhook', () => {
  const first = automationEventKey(
    'deposit',
    'W-123',
    'Approved',
    'betindia_deposit_status_update',
    { amount: 500, user_id: 'user1' }
  );
  const retry = automationEventKey(
    'deposit',
    'W-123',
    ' approved ',
    'betindia_deposit_status_update',
    { user_id: 'user1', amount: 500 }
  );
  assert.equal(first, retry);
});

test('creates a new event key when a transaction status changes', () => {
  const pending = automationEventKey(
    'deposit',
    'W-123',
    'Pending',
    'betindia_deposit_status_update',
    {}
  );
  const approved = automationEventKey(
    'deposit',
    'W-123',
    'Approved',
    'betindia_deposit_status_update',
    {}
  );
  assert.notEqual(pending, approved);
});

test('fallback event keys are stable when a provider omits transaction id', () => {
  const first = automationEventKey(
    'withdrawal',
    '',
    'Pending',
    'betindia_withdrawal_status_update',
    { amount: 900, nested: { user: 'a', source: 'webhook' } }
  );
  const retry = automationEventKey(
    'withdrawal',
    '',
    'Pending',
    'betindia_withdrawal_status_update',
    { nested: { source: 'webhook', user: 'a' }, amount: 900 }
  );
  assert.equal(first, retry);
});

test('builds an Interakt payload from provider field variants', () => {
  const message = buildAutomationMessage('deposit', {
    Mobile_number: '919876543210',
    User_name: 'Abhi',
    User_id: 'abhi0888',
    Amount: '500',
    Transaction_id: 'W-123',
    Payment_status: 'Approved',
  });
  assert.ok(message);
  assert.equal(message.mobile, '9876543210');
  assert.equal(message.countryCode, '+91');
  assert.deepEqual(message.bodyValues.slice(0, 5), [
    'Abhi',
    'abhi0888',
    '500',
    'W-123',
    'Approved',
  ]);
});

test('rejects ambiguous phone numbers instead of truncating them', () => {
  assert.equal(normalizePhone('9876543210')?.phoneNumber, '9876543210');
  assert.equal(normalizePhone('+91 98765 43210')?.phoneNumber, '9876543210');
  assert.equal(normalizePhone('+1 212 555 0100'), null);
});
