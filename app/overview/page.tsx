'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Minus, X } from 'lucide-react';
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

type DetailRow = {
  txn_id?: string | null; type?: string; name?: string | null; user_id?: string | null;
  phone?: string | null; amount?: number | null; occurred_at?: string | null;
  status?: string | null; txns?: number;
};
type Detail = { metric: string; kind: 'transactions' | 'customers'; label: string; rows: DetailRow[] };

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

export default function CompanyOverviewPage() {
  const tenantId = getSelectedTenantId();
  const [period, setPeriod] = useState('month');
  const [detail, setDetail] = useState<{ metric: string; title: string } | null>(null);

  const query = useQuery({
    queryKey: ['backend-overview', tenantId, period],
    queryFn: () => backendRequest<Overview>(`/dashboard?period=${period}`),
    enabled: Boolean(tenantId),
  });
  useAuthRedirect(query.error);

  const detailsQuery = useQuery({
    queryKey: ['overview-details', tenantId, period, detail?.metric],
    queryFn: () => backendRequest<Detail>(`/dashboard/details?period=${period}&metric=${detail!.metric}`),
    enabled: Boolean(tenantId && detail),
  });

  const d = query.data;
  const open = (metric: string, title: string) => setDetail({ metric, title });

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
            <Kpi title="Company profit" hint="Deposits minus withdrawals" g={d.kpis.companyPl} fmt={money} bigColor onClick={() => open('transactions', 'Transactions behind your profit')} />
            <Kpi title="Money deposited" hint={`${count(d.counts.depositCount)} deposits`} g={d.kpis.deposits} fmt={money} onClick={() => open('deposits', 'Deposits')} />
            <Kpi title="Money withdrawn" hint={`${count(d.counts.withdrawalCount)} withdrawals`} g={d.kpis.withdrawals} fmt={money} onClick={() => open('withdrawals', 'Withdrawals')} />
            <Kpi title="New players" hint="Registered in this period" g={d.kpis.newCustomers} fmt={count} onClick={() => open('new', 'New players')} />
            <Kpi title="First-time depositors" hint="Made their first deposit" g={d.kpis.ftd} fmt={count} onClick={() => open('ftd', 'First-time depositors')} />
            <Kpi title="Active players" hint="Deposited or withdrew" g={d.kpis.activeCustomers} fmt={count} onClick={() => open('active', 'Active players')} />
          </div>

          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 16 }}>
            Tip: click any card to see the exact players and payments behind the number. Growth compares this {period === 'today' ? 'day' : period.replace('this ', '')} with the same length of time just before it. Only confirmed (successful) payments count.
          </p>
        </> : null}

        {detail ? (
          <DetailModal
            title={detail.title}
            periodLabel={d?.label ?? ''}
            data={detailsQuery.data}
            loading={detailsQuery.isLoading}
            error={detailsQuery.error instanceof Error ? detailsQuery.error.message : null}
            onClose={() => setDetail(null)}
          />
        ) : null}
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

function Kpi({ title, hint, g, fmt, bigColor, onClick }: { title: string; hint: string; g: Growth; fmt: (v: number) => string; bigColor?: boolean; onClick?: () => void }) {
  const valueColor = bigColor ? (g.current >= 0 ? '#15803d' : '#b91c1c') : undefined;
  return (
    <div className="kpi" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="kpi-body">
        <div className="kpi-label">{title}</div>
        <div className="kpi-value" style={{ fontSize: 26, color: valueColor }}>{fmt(g.current)}</div>
        <div className="kpi-delta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GrowthChip g={g} />
          <span className="kpi-vs" style={{ color: '#94a3b8', fontSize: 12 }}>vs {fmt(g.previous)}</span>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{hint}</div>
      </div>
    </div>
  );
}

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function DetailModal({ title, periodLabel, data, loading, error, onClose }: {
  title: string; periodLabel: string; data?: Detail; loading: boolean; error: string | null; onClose: () => void;
}) {
  const rows = data?.rows ?? [];
  const isTxn = data?.kind === 'transactions';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(920px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #eef2f7' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>{periodLabel}{data ? ` · ${rows.length} shown${rows.length >= 500 ? ' (first 500)' : ''}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 0, background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={18} /></button>
        </div>
        <div style={{ overflow: 'auto', padding: '8px 20px 20px' }}>
          {loading ? <div className="empty2">Loading…</div> : null}
          {error ? <div className="banner2">{error}</div> : null}
          {!loading && !error && rows.length === 0 ? <div className="empty2">Nothing in this period.</div> : null}
          {!loading && rows.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 12 }}>
                  {isTxn ? <>
                    <th style={thStyle}>Type</th><th style={thStyle}>Player</th><th style={thStyle}>Phone</th>
                    <th style={thStyle}>Amount</th><th style={thStyle}>Status</th><th style={thStyle}>When</th>
                  </> : <>
                    <th style={thStyle}>Player</th><th style={thStyle}>Phone</th>
                    <th style={thStyle}>Amount / count</th><th style={thStyle}>When</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    {isTxn ? <>
                      <td style={tdStyle}><span style={{ textTransform: 'capitalize' }}>{r.type}</span></td>
                      <td style={tdStyle}>{r.name || r.user_id || '—'}</td>
                      <td style={tdStyle}>{r.phone || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{r.amount != null ? money(r.amount) : '—'}</td>
                      <td style={tdStyle}><span style={{ textTransform: 'capitalize', color: statusColor(r.status) }}>{(r.status || '').toLowerCase() || '—'}</span></td>
                      <td style={{ ...tdStyle, color: '#64748b' }}>{fmtDate(r.occurred_at)}</td>
                    </> : <>
                      <td style={tdStyle}>{r.name || r.user_id || '—'}</td>
                      <td style={tdStyle}>{r.phone || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{r.amount != null ? money(r.amount) : r.txns != null ? `${r.txns} txns` : (r.status || '—')}</td>
                      <td style={{ ...tdStyle, color: '#64748b' }}>{fmtDate(r.occurred_at)}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 10px' };
function statusColor(s?: string | null) {
  const v = (s || '').toUpperCase();
  return v === 'APPROVED' ? '#15803d' : v === 'REJECTED' || v === 'FAILED' ? '#b91c1c' : '#b45309';
}
