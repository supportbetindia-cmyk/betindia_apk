import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRange, isValidPreset, dashboardQuery, fromToQuery } from '../lib/console-range.ts';

const DAY = 86_400_000;
const OFF = 330 * 60 * 1000;
const now = Date.parse('2026-10-15T06:30:00.000Z'); // 12:00 IST, Thu 15 Oct 2026
const istDayStart = Math.floor((now + OFF) / DAY) * DAY - OFF; // 00:00 IST of 15 Oct

test('today = IST start of day → now', () => {
  const r = resolveRange('today', undefined, undefined, now);
  assert.equal(r.from, istDayStart);
  assert.equal(r.to, now);
  assert.equal(r.backend.period, 'today'); // named → calendar comparison
});

test('yesterday = previous IST day, exclusive of today', () => {
  const r = resolveRange('yesterday', undefined, undefined, now);
  assert.equal(r.from, istDayStart - DAY);
  assert.equal(r.to, istDayStart);
  assert.equal(r.backend.period, 'custom');
});

test('rolling windows are exact and custom', () => {
  for (const [key, days] of [['7d', 7], ['30d', 30], ['90d', 90]]) {
    const r = resolveRange(key, undefined, undefined, now);
    assert.equal(r.to - r.from, days * DAY, key);
    assert.equal(r.to, now, key);
    assert.equal(r.backend.period, 'custom', key);
  }
});

test('custom range is whole-day inclusive in IST', () => {
  const r = resolveRange('custom', '2026-10-01', '2026-10-05', now);
  // Oct 1..5 inclusive = 5 days
  assert.equal(r.to - r.from, 5 * DAY);
  assert.equal(r.from, Date.parse('2026-10-01T00:00:00+05:30'));
  assert.equal(r.backend.period, 'custom');
  assert.equal(r.backend.from, r.from);
  assert.equal(r.backend.to, r.to);
});

test('invalid custom (to before from) never yields a negative window', () => {
  const r = resolveRange('custom', '2026-10-10', '2026-10-01', now);
  assert.ok(r.to >= r.from);
});

test('named periods map correctly; query builders agree', () => {
  assert.equal(resolveRange('thismonth', undefined, undefined, now).backend.period, 'month');
  assert.equal(resolveRange('thisweek', undefined, undefined, now).backend.period, 'week');
  assert.equal(resolveRange('thisyear', undefined, undefined, now).backend.period, 'year');
  const r = resolveRange('30d', undefined, undefined, now);
  assert.equal(dashboardQuery(r), `period=custom&from=${r.from}&to=${r.to}`);
  assert.equal(fromToQuery(r), `from=${r.from}&to=${r.to}`);
  assert.equal(dashboardQuery(resolveRange('thismonth', undefined, undefined, now)), 'period=month');
});

test('isValidPreset guards unknown values', () => {
  assert.ok(isValidPreset('30d'));
  assert.ok(!isValidPreset('nonsense'));
  assert.ok(!isValidPreset(null));
});
