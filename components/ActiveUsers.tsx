'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Loader2 } from 'lucide-react';
import { useMasterFilter } from './MasterFilterProvider';
import { withMaster } from '@/lib/master-filter';

type Preset = 'today' | 'week' | 'month' | '7d' | '30d' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: '7d', label: 'Last 7d' },
  { key: '30d', label: 'Last 30d' },
  { key: 'custom', label: 'Custom' },
];

const DAY = 86_400_000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

type Range = { from: string; to: string; label: string } | null;

function resolveRange(preset: Preset, customFrom: string, customTo: string): Range {
  const now = new Date();
  const today = startOfDay(now);
  if (preset === 'today') return { from: today.toISOString(), to: now.toISOString(), label: 'Today' };
  if (preset === 'week') {
    const dow = (today.getDay() + 6) % 7; // Monday = 0
    const from = new Date(today); from.setDate(today.getDate() - dow);
    return { from: from.toISOString(), to: now.toISOString(), label: 'This week' };
  }
  if (preset === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString(), label: 'This month' };
  }
  if (preset === '7d') return { from: new Date(now.getTime() - 7 * DAY).toISOString(), to: now.toISOString(), label: 'Last 7 days' };
  if (preset === '30d') return { from: new Date(now.getTime() - 30 * DAY).toISOString(), to: now.toISOString(), label: 'Last 30 days' };
  // custom
  if (!customFrom || !customTo) return null;
  const from = startOfDay(new Date(customFrom));
  const to = new Date(startOfDay(new Date(customTo)).getTime() + DAY); // include the whole "to" day
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
  return { from: from.toISOString(), to: to.toISOString(), label: `${customFrom} → ${customTo}` };
}

async function fetchActive(range: NonNullable<Range>, masterId: string): Promise<number> {
  const res = await fetch(withMaster(`/api/user-analytics/active?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, masterId));
  const body = (await res.json()) as { count?: number; error?: string };
  if (!res.ok) throw new Error(body.error || 'Failed to load active users');
  return body.count ?? 0;
}

export function ActiveUsers() {
  const { masterId } = useMasterFilter();
  const [preset, setPreset] = useState<Preset>('today');
  const today = ymd(new Date());
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const range = useMemo(() => resolveRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const query = useQuery({
    queryKey: ['active-users', range?.from, range?.to, masterId],
    queryFn: () => fetchActive(range as NonNullable<Range>, masterId),
    enabled: Boolean(range),
    refetchInterval: 60_000,
  });

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Active Users</h3>
        <div className="txn-filters">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={`txn-filter${preset === p.key ? ' active' : ''}`}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' ? (
        <div className="txn-toolbar" style={{ gap: 10, marginBottom: 14 }}>
          <label className="date-field">From<input type="date" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} /></label>
          <label className="date-field">To<input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} /></label>
        </div>
      ) : null}

      <div className="active-hero">
        <div className="active-hero-icon"><Users size={26} /></div>
        <div>
          <div className="active-hero-num">
            {query.isFetching ? <Loader2 size={26} className="spin" /> : (query.data ?? 0).toLocaleString('en-IN')}
          </div>
          <div className="active-hero-sub">
            {range ? `active users · ${range.label}` : 'pick a valid custom date range'}
          </div>
        </div>
      </div>

      {query.isError ? <div className="banner2">{(query.error as Error).message}</div> : null}
      <div className="panel-note">Active = made at least one deposit or withdrawal in the selected period.</div>
    </div>
  );
}
