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
