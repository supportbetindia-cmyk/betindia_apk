import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDateRange, resolveDateRange } from '../lib/date-range.ts';

test('accepts known ranges and safely defaults unknown values to 7d', () => {
  assert.equal(parseDateRange('today'), 'today');
  assert.equal(parseDateRange('90d'), '90d');
  assert.equal(parseDateRange('unexpected'), '7d');
  assert.equal(parseDateRange(null), '7d');
});

test('today starts at midnight in India and compares the same elapsed duration', () => {
  const now = Date.parse('2026-08-01T06:30:00.000Z'); // 12:00 PM IST
  const range = resolveDateRange('today', now);

  assert.equal(range.from, Date.parse('2026-07-31T18:30:00.000Z'));
  assert.equal(range.to, now);
  assert.equal(range.previousTo, range.from);
  assert.equal(range.previousTo - range.previousFrom, range.to - range.from);
  assert.equal(range.comparisonLabel, 'vs yesterday');
});

test('rolling ranges use an immediately preceding window of equal length', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-08-01T12:00:00.000Z');
  const range = resolveDateRange('30d', now);

  assert.equal(range.to - range.from, 30 * day);
  assert.equal(range.previousTo - range.previousFrom, 30 * day);
  assert.equal(range.previousTo, range.from);
  assert.equal(range.comparisonLabel, 'vs previous 30 days');
});

test('all time has no fabricated comparison period', () => {
  const range = resolveDateRange('all', Date.parse('2026-08-01T12:00:00.000Z'));

  assert.equal(range.from, null);
  assert.equal(range.previousFrom, null);
  assert.equal(range.previousTo, null);
  assert.equal(range.comparisonLabel, 'no previous period');
});
