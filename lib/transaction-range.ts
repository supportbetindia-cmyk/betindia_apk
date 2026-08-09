export const TRANSACTION_RANGE_OPTIONS = [
  { key: 'today', label: 'Today (IST)' },
  { key: 'yesterday', label: 'Yesterday (IST)' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
] as const;

export type TransactionRangeKey = (typeof TRANSACTION_RANGE_OPTIONS)[number]['key'];

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const INDIA_OFFSET_MS = 330 * MINUTE;

export function parseTransactionRange(value: string | null | undefined): TransactionRangeKey {
  return TRANSACTION_RANGE_OPTIONS.some((option) => option.key === value)
    ? (value as TransactionRangeKey)
    : 'today';
}

function startOfIndiaDay(nowMs: number): number {
  return Math.floor((nowMs + INDIA_OFFSET_MS) / DAY) * DAY - INDIA_OFFSET_MS;
}

export function resolveTransactionRange(key: TransactionRangeKey, nowMs: number = Date.now()) {
  const today = startOfIndiaDay(nowMs);
  const option = TRANSACTION_RANGE_OPTIONS.find((item) => item.key === key) ?? TRANSACTION_RANGE_OPTIONS[0];

  if (key === 'all') return { key, label: option.label, from: null, to: nowMs };
  if (key === 'today') return { key, label: option.label, from: today, to: nowMs };
  if (key === 'yesterday') return { key, label: option.label, from: today - DAY, to: today };

  const days = Number.parseInt(key, 10);
  return { key, label: option.label, from: nowMs - days * DAY, to: nowMs };
}

export function filterTransactionRows<T extends { created_at: string }>(
  rows: T[],
  key: TransactionRangeKey,
  nowMs: number = Date.now()
): T[] {
  const range = resolveTransactionRange(key, nowMs);
  return rows.filter((row) => {
    const time = new Date(row.created_at).getTime();
    return Number.isFinite(time) && (range.from === null || time >= range.from) && time < range.to;
  });
}
