import { computeMetrics, type Metrics } from './metrics';
import { resolveDateRange, type DateRangeKey } from './date-range';
import { fetchEvents } from './supabase';
import { SnapshotCache } from './snapshot-cache';

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_STALE_TTL_MS = 5 * 60_000;
const RETENTION_LOOKBACK_MS = 62 * 24 * 60 * 60 * 1000;

function positiveMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const caches = new Map<DateRangeKey, SnapshotCache<Metrics>>();

function createMetricsCache(rangeKey: DateRangeKey): SnapshotCache<Metrics> {
  return new SnapshotCache<Metrics>(async () => {
    const now = Date.now();
    const range = resolveDateRange(rangeKey, now);
    const historyFrom = rangeKey === 'all'
      ? null
      : Math.min(range.previousFrom ?? range.from ?? now, now - RETENTION_LOOKBACK_MS);
    const events = await fetchEvents({
      from: historyFrom === null ? undefined : new Date(historyFrom).toISOString(),
      to: new Date(range.to).toISOString(),
    });
    return computeMetrics(events, { rangeKey, nowMs: now });
  }, {
    ttlMs: positiveMs(process.env.METRICS_CACHE_TTL_MS, DEFAULT_TTL_MS),
    staleTtlMs: positiveMs(process.env.METRICS_STALE_TTL_MS, DEFAULT_STALE_TTL_MS),
  });
}

export function getMetricsSnapshot(rangeKey: DateRangeKey) {
  let cache = caches.get(rangeKey);
  if (!cache) {
    cache = createMetricsCache(rangeKey);
    caches.set(rangeKey, cache);
  }
  return cache.get();
}
