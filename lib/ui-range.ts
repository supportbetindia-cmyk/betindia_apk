// Client-safe date-range presets shared by the Active Users panel and the
// Per-User Breakdown table. Day boundaries use the viewer's local clock, which
// is IST for the operations team.

export type RangePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | '7d' | '30d' | 'custom';

export type UiRange = { from: string | null; to: string; label: string } | null;

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: '7d', label: 'Last 7d' },
  { key: '30d', label: 'Last 30d' },
  { key: 'custom', label: 'Custom' },
];

const DAY = 86_400_000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function resolveUiRange(preset: RangePreset, customFrom = '', customTo = ''): UiRange {
  const now = new Date();
  const today = startOfDay(now);
  switch (preset) {
    case 'all':
      return { from: null, to: now.toISOString(), label: 'All time' };
    case 'today':
      return { from: today.toISOString(), to: now.toISOString(), label: 'Today' };
    case 'yesterday': {
      const y = new Date(today.getTime() - DAY);
      return { from: y.toISOString(), to: today.toISOString(), label: 'Yesterday' };
    }
    case 'week': {
      const dow = (today.getDay() + 6) % 7; // Monday = 0
      const f = new Date(today); f.setDate(today.getDate() - dow);
      return { from: f.toISOString(), to: now.toISOString(), label: 'This week' };
    }
    case 'month': {
      const f = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: f.toISOString(), to: now.toISOString(), label: 'This month' };
    }
    case '7d':
      return { from: new Date(now.getTime() - 7 * DAY).toISOString(), to: now.toISOString(), label: 'Last 7 days' };
    case '30d':
      return { from: new Date(now.getTime() - 30 * DAY).toISOString(), to: now.toISOString(), label: 'Last 30 days' };
    case 'custom': {
      if (!customFrom || !customTo) return null;
      const f = startOfDay(new Date(customFrom));
      const t = new Date(startOfDay(new Date(customTo)).getTime() + DAY); // include the whole "to" day
      if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || t <= f) return null;
      return { from: f.toISOString(), to: t.toISOString(), label: `${customFrom} → ${customTo}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Period comparison (Growth engine): a current window + a "previous" window of
// the SAME elapsed length, so in-progress periods compare fairly.
// ---------------------------------------------------------------------------
export type ComparePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | '7d' | '30d' | 'custom';

export const COMPARE_PRESETS: { key: ComparePreset; label: string }[] = [
  { key: 'today', label: 'Today vs Yesterday' },
  { key: 'week', label: 'This Week vs Last' },
  { key: 'month', label: 'This Month vs Last' },
  { key: 'year', label: 'This Year vs Last' },
  { key: '7d', label: 'Last 7d vs Prev 7d' },
  { key: '30d', label: 'Last 30d vs Prev 30d' },
  { key: 'custom', label: 'Custom' },
];

export type Comparison = { current: { from: string; to: string }; previous: { from: string; to: string }; label: string } | null;

export function resolveComparison(preset: ComparePreset, customFrom = '', customTo = ''): Comparison {
  const now = new Date();
  const today = startOfDay(now);
  const iso = (d: Date) => d.toISOString();
  const win = (from: Date, to: Date) => ({ from: iso(from), to: iso(to) });
  // Previous window of the same length ending exactly where `from` starts.
  const prevSameLen = (from: Date, to: Date, prevFrom: Date) => win(prevFrom, new Date(prevFrom.getTime() + (to.getTime() - from.getTime())));

  switch (preset) {
    case 'today': {
      const from = today, to = now;
      return { current: win(from, to), previous: prevSameLen(from, to, new Date(today.getTime() - DAY)), label: 'Today vs Yesterday' };
    }
    case 'yesterday': {
      const from = new Date(today.getTime() - DAY), to = today;
      return { current: win(from, to), previous: win(new Date(today.getTime() - 2 * DAY), from), label: 'Yesterday vs Day before' };
    }
    case 'week': {
      const dow = (today.getDay() + 6) % 7;
      const from = new Date(today); from.setDate(today.getDate() - dow);
      const to = now;
      return { current: win(from, to), previous: prevSameLen(from, to, new Date(from.getTime() - 7 * DAY)), label: 'This Week vs Last' };
    }
    case 'month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1), to = now;
      return { current: win(from, to), previous: prevSameLen(from, to, new Date(today.getFullYear(), today.getMonth() - 1, 1)), label: 'This Month vs Last' };
    }
    case 'year': {
      const from = new Date(today.getFullYear(), 0, 1), to = now;
      return { current: win(from, to), previous: prevSameLen(from, to, new Date(today.getFullYear() - 1, 0, 1)), label: 'This Year vs Last' };
    }
    case '7d': {
      const to = now, from = new Date(now.getTime() - 7 * DAY);
      return { current: win(from, to), previous: win(new Date(now.getTime() - 14 * DAY), from), label: 'Last 7d vs Prev 7d' };
    }
    case '30d': {
      const to = now, from = new Date(now.getTime() - 30 * DAY);
      return { current: win(from, to), previous: win(new Date(now.getTime() - 60 * DAY), from), label: 'Last 30d vs Prev 30d' };
    }
    case 'custom': {
      if (!customFrom || !customTo) return null;
      const from = startOfDay(new Date(customFrom));
      const to = new Date(startOfDay(new Date(customTo)).getTime() + DAY);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
      const len = to.getTime() - from.getTime();
      return { current: win(from, to), previous: win(new Date(from.getTime() - len), from), label: `${customFrom} → ${customTo} vs prev` };
    }
  }
}
