// Global date-range filter for the SaaS console (Overview / Transactions / Profit …).
// Every boundary is resolved in IST (Asia/Kolkata, fixed +05:30, no DST) so totals,
// charts and tables all agree on the window. Pure functions — trivially testable.
//
// Kept separate from the legacy lib/date-range.ts (used by the product-analytics home)
// to avoid coupling; the two can be unified once both surfaces share one filter.

export const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30
const DAY = 86_400_000;

export type RangePreset =
  | 'today' | 'yesterday' | '7d' | '30d' | '90d'
  | 'thisweek' | 'prevweek' | 'thismonth' | 'prevmonth' | 'thisyear' | 'custom';

export const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'thisweek', label: 'This week' },
  { key: 'prevweek', label: 'Previous week' },
  { key: 'thismonth', label: 'This month' },
  { key: 'prevmonth', label: 'Previous month' },
  { key: 'thisyear', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
];

// Presets that map to a backend NAMED period get a calendar-aligned comparison
// ("this month vs last month"). Everything else is sent as from/to (custom), which
// the backend compares against the same-length window immediately before.
const NAMED: Partial<Record<RangePreset, string>> = {
  today: 'today', thisweek: 'week', thismonth: 'month', thisyear: 'year',
};

export type ResolvedRange = {
  preset: RangePreset;
  from: number; // epoch ms, inclusive start
  to: number;   // epoch ms, exclusive end
  label: string;
  customFrom?: string; // YYYY-MM-DD (custom only)
  customTo?: string;
  backend: { period: string; from?: number; to?: number };
};

export function isValidPreset(v: string | null | undefined): v is RangePreset {
  return !!v && PRESETS.some((p) => p.key === v);
}

// --- IST boundary helpers (treat a shifted Date's UTC getters as the IST clock) ---
function istDayStart(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY) * DAY - IST_OFFSET_MS;
}
function istDow(ms: number): number {
  return new Date(ms + IST_OFFSET_MS).getUTCDay(); // 0=Sun..6=Sat
}
function istMonthStart(ms: number, deltaMonths = 0): number {
  const d = new Date(ms + IST_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deltaMonths, 1) - IST_OFFSET_MS;
}
function istYearStart(ms: number): number {
  const d = new Date(ms + IST_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), 0, 1) - IST_OFFSET_MS;
}

/** Resolve a preset (or custom YYYY-MM-DD dates) into a concrete [from, to) window. */
export function resolveRange(preset: RangePreset, customFrom?: string, customTo?: string, now = Date.now()): ResolvedRange {
  const todayStart = istDayStart(now);
  const weekStart = todayStart - ((istDow(now) + 6) % 7) * DAY; // Monday of this week
  const monthStart = istMonthStart(now);
  let from = todayStart, to = now, label = 'Today';

  switch (preset) {
    case 'today': from = todayStart; to = now; label = 'Today'; break;
    case 'yesterday': from = todayStart - DAY; to = todayStart; label = 'Yesterday'; break;
    case '7d': from = now - 7 * DAY; to = now; label = 'Last 7 days'; break;
    case '30d': from = now - 30 * DAY; to = now; label = 'Last 30 days'; break;
    case '90d': from = now - 90 * DAY; to = now; label = 'Last 90 days'; break;
    case 'thisweek': from = weekStart; to = now; label = 'This week'; break;
    case 'prevweek': from = weekStart - 7 * DAY; to = weekStart; label = 'Previous week'; break;
    case 'thismonth': from = monthStart; to = now; label = 'This month'; break;
    case 'prevmonth': from = istMonthStart(now, -1); to = monthStart; label = 'Previous month'; break;
    case 'thisyear': from = istYearStart(now); to = now; label = 'This year'; break;
    case 'custom': {
      // Inclusive whole-day range in IST: [start-of(from-day), start-of(to-day)+1day).
      const f = customFrom ? Date.parse(`${customFrom}T00:00:00+05:30`) : todayStart;
      const t = customTo ? Date.parse(`${customTo}T00:00:00+05:30`) + DAY : now;
      from = Number.isFinite(f) ? f : todayStart;
      to = Number.isFinite(t) ? t : now;
      if (to < from) to = from; // guard: never a negative window
      label = customFrom && customTo ? `${customFrom} → ${customTo}` : 'Custom range';
      break;
    }
  }

  const named = NAMED[preset];
  const backend = named ? { period: named } : { period: 'custom', from, to };
  return { preset, from, to, label, customFrom, customTo, backend };
}

/** Query string for the dashboard endpoints (named period, or custom from/to). */
export function dashboardQuery(r: ResolvedRange): string {
  return r.backend.period === 'custom'
    ? `period=custom&from=${r.backend.from}&to=${r.backend.to}`
    : `period=${r.backend.period}`;
}

/** Query string for endpoints that filter purely by from/to (e.g. transactions). */
export function fromToQuery(r: ResolvedRange): string {
  return `from=${r.from}&to=${r.to}`;
}
