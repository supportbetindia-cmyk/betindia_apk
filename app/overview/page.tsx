'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { PeriodTabs } from '@/components/saas/PeriodTabs';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { money, count } from '@/lib/format';
import { backendRequest, getSelectedTenantId } from '@/lib/backend-api';

type Growth = {
  current: number; previous: number;
  changePct: number | null; changeX: number | null;
  mode: 'normal' | 'new_base' | 'flat';
};
type Overview = {
  period: string; label: string;
  totalCustomers: number;
  kpis: {
    newCustomers: Growth; ftd: Growth; activeCustomers: Growth;
    deposits: Growth; withdrawals: Growth; companyPl: Growth;
  };
  counts: { depositCount: number; withdrawalCount: number };
};

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

export default function CompanyOverviewPage() {
  const tenantId = getSelectedTenantId();
  const [period, setPeriod] = useState('month');

  const query = useQuery({
    queryKey: ['backend-overview', tenantId, period],
    queryFn: () => backendRequest<Overview>(`/dashboard?period=${period}`),
    enabled: Boolean(tenantId),
  });
  useAuthRedirect(query.error);

  const d = query.data;

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Company overview</h1>
            <p className="page-sub">How the business is doing{d ? ` — ${d.label.toLowerCase()}` : ''}</p>
          </div>
          <PeriodTabs value={period} onChange={setPeriod} options={PERIODS} />
        </header>

        {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}
        {query.isError ? <div className="banner2">{query.error instanceof Error ? query.error.message : 'Could not load the overview'}</div> : null}
        {query.isLoading ? <div className="panel"><div className="empty2">Loading…</div></div> : null}

        {d ? <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 15, color: '#475569' }}>Total players so far:</span>
            <span style={{ fontSize: 22, fontWeight: 800 }}>{count(d.totalCustomers)}</span>
          </div>

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 12 }}>
            <Kpi title="Company profit" hint="Deposits minus withdrawals" g={d.kpis.companyPl} fmt={money} bigColor />
            <Kpi title="Money deposited" hint={`${count(d.counts.depositCount)} deposits`} g={d.kpis.deposits} fmt={money} />
            <Kpi title="Money withdrawn" hint={`${count(d.counts.withdrawalCount)} withdrawals`} g={d.kpis.withdrawals} fmt={money} />
            <Kpi title="New players" hint="Registered in this period" g={d.kpis.newCustomers} fmt={count} />
            <Kpi title="First-time depositors" hint="Made their first deposit" g={d.kpis.ftd} fmt={count} />
            <Kpi title="Active players" hint="Deposited or withdrew" g={d.kpis.activeCustomers} fmt={count} />
          </div>

          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 16 }}>
            Growth compares this {period === 'today' ? 'day' : period.replace('this ', '')} with the same length of time just before it. Only confirmed (successful) payments count.
          </p>
        </> : null}
      </main>
    </div>
  );
}

function GrowthChip({ g }: { g: Growth }) {
  if (g.mode === 'new_base') return <span style={{ color: '#1d4ed8', fontWeight: 700, fontSize: 13 }}>New</span>;
  const pct = g.changePct ?? 0;
  const up = pct > 0, down = pct < 0;
  const color = up ? '#15803d' : down ? '#b91c1c' : '#64748b';
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontWeight: 700, fontSize: 13 }}>
      <Icon size={15} />
      {pct > 0 ? '+' : ''}{pct}%
      {g.changeX != null ? <span style={{ color: '#94a3b8', fontWeight: 500 }}> · {g.changeX}x</span> : null}
    </span>
  );
}

function Kpi({ title, hint, g, fmt, bigColor }: { title: string; hint: string; g: Growth; fmt: (v: number) => string; bigColor?: boolean }) {
  const valueColor = bigColor ? (g.current >= 0 ? '#15803d' : '#b91c1c') : undefined;
  return (
    <div className="kpi"><div className="kpi-body">
      <div className="kpi-label">{title}</div>
      <div className="kpi-value" style={{ fontSize: 26, color: valueColor }}>{fmt(g.current)}</div>
      <div className="kpi-delta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GrowthChip g={g} />
        <span className="kpi-vs" style={{ color: '#94a3b8', fontSize: 12 }}>vs {fmt(g.previous)}</span>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{hint}</div>
    </div></div>
  );
}
