import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../lib/metrics.ts';

const now = Date.parse('2026-08-08T12:00:00.000Z');
const event = (id, name, device, hoursAgo, properties = {}) => ({
  id,
  event_name: name,
  created_at: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
  device_id: device,
  session_id: `session-${id}`,
  properties,
  context: {},
});

test('keeps anonymous devices and identified account users as separate metrics', () => {
  const metrics = computeMetrics([
    event(1, 'install', 'device-a', 48),
    event(2, 'app_open', 'device-a', 2, { user_id: 'user-1' }),
    event(3, 'install', 'device-b', 24),
    event(4, 'app_open', 'device-b', 1, { user_id: 'user-2' }),
    event(5, 'app_open', 'device-c', 1),
  ], { rangeKey: '7d', nowMs: now });

  assert.equal(metrics.identity.knownDevices, 3);
  assert.equal(metrics.identity.verifiedInstalls, 2);
  assert.equal(metrics.identity.identifiedUsers, 2);
  assert.equal(metrics.identity.activeIdentifiedUsers, 2);
  assert.equal(metrics.identity.anonymousActiveDevices, 1);
  assert.equal(metrics.identity.coveragePct, 66.7);
});
