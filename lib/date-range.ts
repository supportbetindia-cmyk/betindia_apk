export const DATE_RANGE_OPTIONS = [
  { key: 'today', label: 'Today (IST)' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
] as const;

export type DateRangeKey = (typeof DATE_RANGE_OPTIONS)[number]['key'];

export type ResolvedDateRange = {
  key: DateRangeKey;
  label: string;
  comparisonLabel: string;
  from: number | null;
  to: number;
  previousFrom: number | null;
  previousTo: number | null;
};

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const INDIA_OFFSET_MS = 330 * MINUTE;

export function parseDateRange(value: string | null | undefined): DateRangeKey {
  return DATE_RANGE_OPTIONS.some((option) => option.key === value)
    ? (value as DateRangeKey)
    : '7d';
}

function startOfIndiaDay(nowMs: number): number {
  return Math.floor((nowMs + INDIA_OFFSET_MS) / DAY) * DAY - INDIA_OFFSET_MS;
}

export function resolveDateRange(key: DateRangeKey, nowMs: number = Date.now()): ResolvedDateRange {
  const option = DATE_RANGE_OPTIONS.find((item) => item.key === key) ?? DATE_RANGE_OPTIONS[1];

  if (key === 'all') {
    return {
      key,
      label: option.label,
      comparisonLabel: 'no previous period',
      from: null,
      to: nowMs,
      previousFrom: null,
      previousTo: null,
    };
  }

  const from = key === 'today'
    ? startOfIndiaDay(nowMs)
    : nowMs - Number.parseInt(key, 10) * DAY;
  const duration = nowMs - from;

  return {
    key,
    label: option.label,
    comparisonLabel: key === 'today' ? 'vs yesterday' : `vs previous ${key.replace('d', ' days')}`,
    from,
    to: nowMs,
    previousFrom: from - duration,
    previousTo: from,
  };
}
