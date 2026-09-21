'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, PiggyBank } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { PeriodTabs } from '@/components/saas/PeriodTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { money } from '@/lib/format';
import { backendRequest, getSelectedTenantId } from '@/lib/backend-api';

type Line = { id: string; name: string; percent: number; isRetained: boolean; amount: number };
type Plan = { period: string; distributable: number; totalPercent: number; unallocated: number; valid: boolean; lines: Line[] };

const PERIODS = [{ key: 'month', label: 'This month' }, { key: 'quarter', label: 'This quarter' }, { key: 'year', label: 'This year' }];

export default function ProfitPage() {
  const qc = useQueryClient();
  const tenantId = getSelectedTenantId();
  const [period, setPeriod] = useState('month');
  const [name, setName] = useState('');
  const [percent, setPercent] = useState('');
  const [retained, setRetained] = useState(false);

  const query = useQuery({
    queryKey: ['allocations', tenantId, period],
    queryFn: () => backendRequest<Plan>(`/allocations?period=${period}`),
    enabled: Boolean(tenantId),
  });
  useAuthRedirect(query.error);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['allocations', tenantId] });
  const add = useMutation({
    mutationFn: (b: { name: string; percent: number; isRetained: boolean }) => backendRequest('/allocations', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess: () => { setName(''); setPercent(''); setRetained(false); invalidate(); },
  });
  const edit = useMutation({
    mutationFn: (b: { id: string; percent: number }) => backendRequest(`/allocations/${b.id}`, { method: 'PATCH', body: JSON.stringify({ percent: b.percent }) }),
    onSuccess: invalidate,
  });
  const del = useMutation({ mutationFn: (id: string) => backendRequest(`/allocations/${id}`, { method: 'DELETE' }), onSuccess: invalidate });

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = Number(percent);
    if (!name.trim() || !Number.isFinite(p) || p < 0 || p > 100) return;
    add.mutate({ name: name.trim(), percent: p, isRetained: retained });
  }

  const d = query.data;
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Profit distribution</h1>
            <p className="page-sub">Split the profit across departments. Must add up to 100%.</p>
          </div>
          <PeriodTabs value={period} onChange={setPeriod} options={PERIODS} />
        </header>

        {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}

        {d ? <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 15, color: '#475569' }}>Profit to share:</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: d.distributable >= 0 ? '#15803d' : '#b91c1c' }}>{money(d.distributable)}</span>
          </div>

          {/* 100% status banner */}
          <div className="banner2" style={{ background: d.valid ? '#ecfdf3' : '#fff7ed', border: `1px solid ${d.valid ? '#abefc6' : '#fed7aa'}`, color: d.valid ? '#15803d' : '#b45309' }}>
            {d.valid ? '✓ Fully allocated (100%).'
              : d.unallocated > 0 ? `${d.unallocated}% not allocated yet — add lines until it reaches 100%.`
              : `Over by ${Math.abs(d.unallocated)}% — reduce some lines to reach 100%.`}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Add a line</h3></div>
            <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Department name" style={{ width: 220 }} />
              <Input value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="%" type="number" style={{ width: 100 }} />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569' }}>
                <input type="checkbox" checked={retained} onChange={(e) => setRetained(e.target.checked)} /> Retained profit (keep)
              </label>
              <Button type="submit" disabled={add.isPending || !name || !percent}>{add.isPending ? 'Adding…' : 'Add'}</Button>
            </form>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Split</h3><span className="page-sub" style={{ color: d.valid ? '#15803d' : '#b45309', fontWeight: 700 }}>{d.totalPercent}% of 100%</span></div>
            {d.lines.length === 0 ? <div className="empty2">No lines yet. Add departments above.</div> : null}
            <div style={{ display: 'grid', gap: 8 }}>
              {d.lines.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid #eef2f7', borderRadius: 10 }}>
                  <div style={{ flex: 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {l.isRetained ? <PiggyBank size={15} color="#b08d3f" /> : null}{l.name}
                  </div>
                  <Input defaultValue={l.percent} type="number" onBlur={(e) => { const p = Number(e.target.value); if (p !== l.percent && p >= 0 && p <= 100) edit.mutate({ id: l.id, percent: p }); }} style={{ width: 80 }} />
                  <span style={{ color: '#64748b' }}>%</span>
                  <div style={{ width: 140, textAlign: 'right', fontWeight: 700, color: l.amount >= 0 ? '#0d1229' : '#b91c1c' }}>{money(l.amount)}</div>
                  <button onClick={() => del.mutate(l.id)} title="Remove" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </> : null}
      </main>
    </div>
  );
}
