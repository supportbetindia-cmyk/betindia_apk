'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useMasterFilter } from '@/components/MasterFilterProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { money, count } from '@/lib/format';
import { backendRequest } from '@/lib/backend-api';

type Target = {
  id: string; metric: string; period: string;
  target: number; actual: number; remaining: number; achievementPct: number | null;
};

const METRICS = [
  { key: 'profit', label: 'Company profit', money: true },
  { key: 'deposits', label: 'Deposits', money: true },
  { key: 'ftd', label: 'First-time depositors', money: false },
  { key: 'customers', label: 'New players', money: false },
];
const PERIODS = [
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
];

const isMoney = (metric: string) => METRICS.find((m) => m.key === metric)?.money ?? false;
const fmt = (metric: string, v: number) => (isMoney(metric) ? money(v) : count(v));
const label = (arr: { key: string; label: string }[], k: string) => arr.find((x) => x.key === k)?.label ?? k;

export default function TargetsPage() {
  const qc = useQueryClient();
  const { tenantId, masterId, scopedHref } = useMasterFilter();
  const [metric, setMetric] = useState('profit');
  const [period, setPeriod] = useState('month');
  const [value, setValue] = useState('');

  const query = useQuery({
    queryKey: ['targets', tenantId, masterId],
    queryFn: ({ signal }) => backendRequest<Target[]>(scopedHref('/targets'), { tenantId, signal }),
    enabled: Boolean(tenantId),
  });
  useAuthRedirect(query.error);

  const save = useMutation({
    mutationFn: (body: { metric: string; period: string; targetValue: number }) =>
      backendRequest('/targets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setValue(''); qc.invalidateQueries({ queryKey: ['targets', tenantId] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => backendRequest(`/targets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['targets', tenantId] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    save.mutate({ metric, period, targetValue: n });
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Targets</h1>
            <p className="page-sub">Set a goal and see how close you are</p>
          </div>
        </header>

        {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}

        {masterId ? <div className="banner2">Actuals show Master {masterId}&apos;s contribution toward company-wide targets. Editing a target affects the whole company.</div> : null}
        {query.isError ? <div role="alert" className="banner2">{query.error.message}</div> : null}
        <div className="panel">
          <div className="panel-head"><h3>Set a target</h3></div>
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} style={selectStyle}>
              {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} style={selectStyle}>
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={isMoney(metric) ? 'Target amount (₹)' : 'Target count'} type="number" style={{ width: 200 }} />
            <Button type="submit" disabled={save.isPending || !value}>{save.isPending ? 'Saving…' : 'Save target'}</Button>
          </form>
          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Saving again for the same metric + period updates it.</p>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Your targets</h3></div>
          {query.isLoading ? <div className="empty2">Loading…</div> : null}
          {query.data && query.data.length === 0 ? <div className="empty2">No targets yet. Add one above.</div> : null}
          <div style={{ display: 'grid', gap: 12 }}>
            {query.data?.map((t) => {
              const pct = t.achievementPct;
              const bar = Math.max(0, Math.min(100, pct ?? 0));
              const hit = (pct ?? 0) >= 100;
              return (
                <div key={t.id} style={{ border: '1px solid #eef2f7', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{label(METRICS, t.metric)} <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {label(PERIODS, t.period)}</span></div>
                    <button onClick={() => del.mutate(t.id)} title="Remove" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={16} /></button>
                  </div>
                  <div style={{ height: 10, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${bar}%`, height: '100%', background: hit ? '#15803d' : '#4f46e5', transition: 'width .3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
                    <span><b>{fmt(t.metric, t.actual)}</b> <span style={{ color: '#94a3b8' }}>of {fmt(t.metric, t.target)}</span></span>
                    <span style={{ fontWeight: 700, color: hit ? '#15803d' : '#475569' }}>
                      {pct == null ? '—' : `${pct}%`}{t.remaining > 0 ? <span style={{ color: '#94a3b8', fontWeight: 500 }}> · {fmt(t.metric, t.remaining)} to go</span> : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

const selectStyle: React.CSSProperties = { height: 38, border: '1px solid #d6d3d1', borderRadius: 7, padding: '0 10px', background: '#fff' };
