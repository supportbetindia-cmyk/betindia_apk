'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { COMPARE_PRESETS, resolveComparison, type ComparePreset } from '@/lib/ui-range';
import type { GrowthMetric, GrowthResult } from '@/lib/growth';
import { cn } from '@/lib/utils';
import { useMasterFilter } from './MasterFilterProvider';
import { withMaster } from '@/lib/master-filter';

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const fmt = (m: GrowthMetric) => (m.format === 'money' ? money(m.current) : m.current.toLocaleString('en-IN'));
const fmtPrev = (m: GrowthMetric) => (m.format === 'money' ? money(m.previous) : m.previous.toLocaleString('en-IN'));

async function fetchGrowth(c: NonNullable<ReturnType<typeof resolveComparison>>, label: string, masterId: string): Promise<GrowthResult> {
  const q = new URLSearchParams({ from: c.current.from, to: c.current.to, prevFrom: c.previous.from, prevTo: c.previous.to, label });
  const res = await fetch(withMaster(`/api/user-analytics/growth?${q.toString()}`, masterId), { cache: 'no-store' });
  const body = (await res.json()) as GrowthResult & { error?: string };
  if (!res.ok) throw new Error(body.error || 'Failed to load growth');
  return body;
}

export function GrowthPanel() {
  const { masterId } = useMasterFilter();
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState<ComparePreset>('month');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const cmp = useMemo(() => resolveComparison(preset, from, to), [preset, from, to]);

  const query = useQuery({
    queryKey: ['growth', cmp?.current.from, cmp?.current.to, cmp?.previous.from, cmp?.previous.to, masterId],
    queryFn: () => fetchGrowth(cmp!, cmp!.label, masterId),
    enabled: Boolean(cmp),
    refetchInterval: 60_000,
  });

  const metrics = query.data?.metrics ?? [];

  return (
    <Card className="mb-4 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Growth</h3>
          <p className="text-xs text-muted-foreground">{cmp?.label ?? 'Pick a period'} · same-length previous window</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as ComparePreset)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>{COMPARE_PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          {preset === 'custom' ? (
            <>
              <Input type="date" className="w-[150px]" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" className="w-[150px]" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
            </>
          ) : null}
        </div>
      </div>

      {query.isError ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{(query.error as Error).message}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {metrics.length
            ? metrics.map((m) => <GrowthCard key={m.key} m={m} value={fmt(m)} prev={fmtPrev(m)} />)
            : Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Loading…</div>
                  <div className="mt-2 flex items-center gap-2 text-lg font-bold text-muted-foreground">
                    {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : '—'}
                  </div>
                </div>
              ))}
        </div>
      )}
    </Card>
  );
}

function GrowthCard({ m, value, prev }: { m: GrowthMetric; value: string; prev: string }) {
  const up = (m.pct ?? 0) >= 0;
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{m.label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold">
        {m.state === 'NEW_BASE' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">New base</span>
        ) : m.state === 'FLAT' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground"><Minus className="h-3 w-3" /> No change</span>
        ) : (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', up ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {m.x != null ? `${m.x}x · ` : ''}{up ? '+' : ''}{m.pct}%
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">prev {prev}</div>
    </div>
  );
}
