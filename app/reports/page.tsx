'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Printer } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { backendRequest, getSelectedTenantId } from '@/lib/backend-api';
import { count, money } from '@/lib/format';

type ReportType = 'daily' | 'weekly' | 'monthly';
type Growth = { current: number; previous: number; changePct: number | null; changeX: number | null; mode: 'normal' | 'new_base' | 'flat' };
type Report = {
  type: ReportType;
  generatedAt: string;
  overview: {
    label: string;
    range: { current: { start: string; end: string }; previous: { start: string; end: string } };
    totalCustomers: number;
    kpis: { newCustomers: Growth; ftd: Growth; activeCustomers: Growth; deposits: Growth; withdrawals: Growth; companyPl: Growth };
    counts: { depositCount: number; withdrawalCount: number };
  };
  traceability: { source: string; companyPlFormula: string; comparison: string };
  allocations?: { id: string; name: string; isRetained: boolean; percent: number; amount: number }[];
  targets?: { metric: string; target: number; actual: number; remaining: number; achievementPct: number | null }[];
};

const TYPES: { key: ReportType; label: string }[] = [
  { key: 'daily', label: 'Daily' }, { key: 'weekly', label: 'Weekly' }, { key: 'monthly', label: 'Monthly' },
];
const KPI: { key: keyof Report['overview']['kpis']; label: string; format: (value: number) => string }[] = [
  { key: 'newCustomers', label: 'New players', format: count },
  { key: 'ftd', label: 'First-time depositors', format: count },
  { key: 'activeCustomers', label: 'Active players', format: count },
  { key: 'deposits', label: 'Deposits', format: money },
  { key: 'withdrawals', label: 'Withdrawals', format: money },
  { key: 'companyPl', label: 'Company P/L', format: money },
];

export default function ReportsPage() {
  const tenantId = getSelectedTenantId();
  const [type, setType] = useState<ReportType>('daily');
  const query = useQuery({ queryKey: ['report', tenantId, type], queryFn: () => backendRequest<Report>(`/reports/${type}`), enabled: Boolean(tenantId) });
  useAuthRedirect(query.error);
  const report = query.data;

  return <div className="shell">
    <Sidebar />
    <main className="main report-page">
      <header className="topbar2">
        <div><h1 className="page-title">Reports</h1><p className="page-sub">A traceable view of company performance.</p></div>
        <button className="btn-ghost report-print" onClick={() => window.print()} disabled={!report}><Printer size={15} /> Print report</button>
      </header>
      {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}
      {query.isError ? <div className="banner2">{query.error instanceof Error ? query.error.message : 'Could not load the report'}</div> : null}

      <div className="report-tabs">{TYPES.map((item) => <button key={item.key} className={type === item.key ? 'active' : ''} onClick={() => setType(item.key)}>{item.label}</button>)}</div>
      {query.isLoading ? <div className="panel"><div className="empty2">Preparing report…</div></div> : null}

      {report ? <>
        <section className="panel report-summary-head">
          <div><span className="report-eyebrow">{type} performance report</span><h2>{report.overview.label}</h2></div>
          <div className="report-range"><CalendarDays size={16} /><span>{range(report.overview.range.current.start, report.overview.range.current.end)}</span></div>
        </section>

        <section className="report-kpis">{KPI.map((item) => <ReportKpi key={item.key} label={item.label} value={report.overview.kpis[item.key]} format={item.format} />)}</section>

        <section className="panel report-comparison">
          <div className="panel-head"><h3>Current versus previous period</h3><span className="panel-tag">Same elapsed duration</span></div>
          <div className="report-table report-table-head"><span>Metric</span><span>Current</span><span>Previous</span><span>Growth</span></div>
          {KPI.map((item) => { const value = report.overview.kpis[item.key]; return <div className="report-table" key={item.key}>
            <b>{item.label}</b><span>{item.format(value.current)}</span><span>{item.format(value.previous)}</span><GrowthText value={value} />
          </div>; })}
        </section>

        {type === 'monthly' ? <div className="report-monthly-grid">
          <section className="panel"><div className="panel-head"><h3>Profit distribution</h3></div>
            {report.allocations?.length ? report.allocations.map((item) => <div className="report-line" key={item.id}><span>{item.name}{item.isRetained ? ' · retained' : ''}</span><b>{item.percent}% · {money(item.amount)}</b></div>) : <div className="empty2">No profit split configured.</div>}
          </section>
          <section className="panel"><div className="panel-head"><h3>Monthly targets</h3></div>
            {report.targets?.length ? report.targets.map((item) => <div className="report-line" key={item.metric}><span>{targetLabel(item.metric)}</span><b>{item.achievementPct == null ? '—' : `${item.achievementPct}%`}</b></div>) : <div className="empty2">No monthly targets configured.</div>}
          </section>
        </div> : null}

        <footer className="report-source"><b>How this report is calculated:</b> {report.traceability.source}. Company P/L = {report.traceability.companyPlFormula.toLowerCase()}. Generated {new Date(report.generatedAt).toLocaleString('en-IN')}.</footer>
      </> : null}
    </main>
  </div>;
}

function ReportKpi({ label, value, format }: { label: string; value: Growth; format: (value: number) => string }) {
  return <div className="panel report-kpi"><span>{label}</span><strong>{format(value.current)}</strong><GrowthText value={value} /></div>;
}

function GrowthText({ value }: { value: Growth }) {
  if (value.mode === 'new_base') return <span className="report-growth new">New base</span>;
  const positive = (value.changePct ?? 0) > 0;
  const negative = (value.changePct ?? 0) < 0;
  return <span className={`report-growth${positive ? ' up' : negative ? ' down' : ''}`}>{value.changePct ?? 0}%{value.changeX != null ? ` · ${value.changeX}x` : ''}</span>;
}

function range(start: string, end: string) {
  const fmt = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function targetLabel(metric: string) {
  return ({ profit: 'Company profit', deposits: 'Deposits', ftd: 'First-time depositors', customers: 'New players' } as Record<string, string>)[metric] ?? metric;
}
