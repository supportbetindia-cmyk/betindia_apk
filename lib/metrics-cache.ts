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

const caches = new Map<string, SnapshotCache<Metrics>>();

function createMetricsCache(rangeKey: DateRangeKey, masterId?: string): SnapshotCache<Metrics> {
  return new SnapshotCache<Metrics>(async () => {
    const now = Date.now();
    const range = resolveDateRange(rangeKey, now);
    const historyFrom = rangeKey === 'all'
      ? null
      : Math.min(range.previousFrom ?? range.from ?? now, now - RETENTION_LOOKBACK_MS);
    const events = await fetchEvents({
      from: historyFrom === null ? undefined : new Date(historyFrom).toISOString(),
      to: new Date(range.to).toISOString(),
      masterId,
    });
    return computeMetrics(events, { rangeKey, nowMs: now });
  }, {
    ttlMs: positiveMs(process.env.METRICS_CACHE_TTL_MS, DEFAULT_TTL_MS),
    staleTtlMs: positiveMs(process.env.METRICS_STALE_TTL_MS, DEFAULT_STALE_TTL_MS),
  });
}

export function getMetricsSnapshot(rangeKey: DateRangeKey, masterId?: string) {
  const key = `${rangeKey}:${masterId ?? ''}`;
  let cache = caches.get(key);
  if (!cache) {
    cache = createMetricsCache(rangeKey, masterId);
    caches.set(key, cache);
  }
  return cache.get();
}
