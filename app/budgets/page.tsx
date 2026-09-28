'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { useMasterFilter } from '@/components/MasterFilterProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { money } from '@/lib/format';
import { backendRequest } from '@/lib/backend-api';

type BudgetLine = {
  departmentId: string; name: string; budgetId: string | null;
  budget: number; actual: number; remaining: number; usedPct: number | null; overBudget: boolean;
};
type BudgetView = {
  period: string;
  lines: BudgetLine[];
  summary: { totalBudget: number; totalActual: number; remaining: number; usedPct: number | null };
};
type Draft = { budget: string; actual: string };

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function BudgetsPage() {
  const qc = useQueryClient();
  const { tenantId } = useMasterFilter();
  const [period, setPeriod] = useState(thisMonth());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const query = useQuery({
    queryKey: ['budgets', tenantId, period],
    queryFn: ({ signal }) => backendRequest<BudgetView>(`/budgets?period=${period}`, { tenantId, signal }),
    enabled: Boolean(tenantId),
  });
  useAuthRedirect(query.error);

  // Seed the editable fields whenever new data arrives for a period.
  useEffect(() => {
    if (!query.data) return;
    const next: Record<string, Draft> = {};
    for (const l of query.data.lines) next[l.departmentId] = { budget: String(l.budget), actual: String(l.actual) };
    setDrafts(next);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (body: { departmentId: string; period: string; budgetAmount: number; actualAmount: number }) =>
      backendRequest('/budgets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets', tenantId, period] }),
  });

  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const isDirty = (l: BudgetLine) => {
    const d = drafts[l.departmentId];
    return d && (Number(d.budget) !== l.budget || Number(d.actual) !== l.actual);
  };
  const saveRow = (l: BudgetLine) => {
    const d = drafts[l.departmentId];
    save.mutate({
      departmentId: l.departmentId, period,
      budgetAmount: Math.max(0, Number(d.budget) || 0),
      actualAmount: Math.max(0, Number(d.actual) || 0),
    });
  };

  const s = query.data?.summary;

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Budgets</h1>
            <p className="page-sub">Set a budget per department and track spend against it</p>
          </div>
          <div className="topbar-actions">
            <label className="kpi-vs" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Month
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())}
                style={{ height: 38, border: '1px solid #d6d3d1', borderRadius: 7, padding: '0 10px', background: '#fff' }} />
            </label>
          </div>
        </header>

        {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}
        {query.isError ? <div role="alert" className="banner2">{query.error.message}</div> : null}

        {/* Summary */}
        {s ? (
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Mini label="Total budget" value={money(s.totalBudget)} sub="all departments" color="#4f46e5" />
            <Mini label="Total spent" value={money(s.totalActual)} sub="actual this month" color="#0369a1" />
            <Mini label="Remaining" value={money(s.remaining)} sub={s.remaining < 0 ? 'over budget' : 'left to spend'} color={s.remaining < 0 ? '#b91c1c' : '#15803d'} />
            <Mini label="Used" value={s.usedPct == null ? '—' : `${s.usedPct}%`} sub="of total budget" color={(s.usedPct ?? 0) > 100 ? '#b91c1c' : '#475569'} />
          </div>
        ) : null}

        {/* Department table */}
        <div className="panel">
          <div className="panel-head"><h3>By department</h3><span className="panel-tag">budget vs actual</span></div>
          {query.isLoading ? <div className="empty2">Loading…</div> : null}
          {query.data && query.data.lines.length === 0 ? (
            <div className="empty2">No departments yet. Add them under <b>Departments</b> first, then set their budgets here.</div>
          ) : null}
          {query.data && query.data.lines.length > 0 ? (
            <div className="txn-table">
              <div className="txn-head" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1.4fr 0.7fr' }}>
                <span>Department</span><span>Budget (₹)</span><span>Actual (₹)</span><span>Remaining</span><span>Used</span><span></span>
              </div>
              {query.data.lines.map((l) => {
                const d = drafts[l.departmentId] ?? { budget: String(l.budget), actual: String(l.actual) };
                const bar = Math.max(0, Math.min(100, l.usedPct ?? 0));
                const barColor = l.overBudget ? '#b91c1c' : (l.usedPct ?? 0) >= 80 ? '#b45309' : '#15803d';
                return (
                  <div className="txn-row" key={l.departmentId} style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1.4fr 0.7fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{l.name}</span>
                    <Input type="number" min={0} value={d.budget} onChange={(e) => setDraft(l.departmentId, { budget: e.target.value })} style={{ width: 120 }} />
                    <Input type="number" min={0} value={d.actual} onChange={(e) => setDraft(l.departmentId, { actual: e.target.value })} style={{ width: 120 }} />
                    <span style={{ color: l.remaining < 0 ? '#b91c1c' : '#334155' }}>{money(l.remaining)}</span>
                    <span>
                      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{ width: `${bar}%`, height: '100%', background: barColor, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 12, color: barColor, fontWeight: 600 }}>
                        {l.usedPct == null ? 'no budget set' : `${l.usedPct}%${l.overBudget ? ' · over budget' : ''}`}
                      </span>
                    </span>
                    <Button onClick={() => saveRow(l)} disabled={save.isPending || !isDirty(l)} style={{ height: 34 }}>
                      {save.isPending ? '…' : 'Save'}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 10 }}>
            Actual spend is entered here for each department. Prior months keep their own figures — changing this month never rewrites them.
          </p>
        </div>
      </main>
    </div>
  );
}

function Mini({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="kpi" style={{ display: 'block' }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-delta"><span className="kpi-vs">{sub}</span></div>
    </div>
  );
}
