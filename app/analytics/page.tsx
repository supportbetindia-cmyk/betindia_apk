'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { CsvMatch } from '@/components/CsvMatch';
import { ActiveUsers } from '@/components/ActiveUsers';
import { TrendLines } from '@/components/analytics-charts';
import { UserDetail } from '@/components/UserDetail';
import { RANGE_PRESETS, resolveUiRange, type RangePreset } from '@/lib/ui-range';
import type { CSSProperties, ReactNode } from 'react';
import type { UserAnalytics, UserRow, UserStatus } from '@/lib/user-analytics';
import {
  BadgeIndianRupee,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CircleDollarSign,
  Download,
  LogOut,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react';

type Data = UserAnalytics & { configured: boolean; error?: string };

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const dateShort = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Active',
  lapsed: 'Lapsed',
  dormant: 'Dormant',
  registered_only: 'No activity',
};
const STATUS_CLASS: Record<UserStatus, string> = {
  active: 's-completed',
  lapsed: 's-scheduled',
  dormant: 's-failed',
  registered_only: 's-sent',
};

async function fetchAnalytics(): Promise<Data> {
  const res = await fetch('/api/user-analytics', { cache: 'no-store' });
  const body = (await res.json()) as Data;
  if (!res.ok) throw new Error(body.error || 'User analytics is temporarily unavailable');
  return body;
}

async function fetchBreakdown(from: string, to: string): Promise<UserRow[]> {
  const res = await fetch(`/api/user-analytics/breakdown?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const body = (await res.json()) as { rows?: UserRow[]; error?: string };
  if (!res.ok) throw new Error(body.error || 'Failed to load breakdown');
  return body.rows ?? [];
}

type StatusFilter = 'all' | UserStatus | 'depositors';
type SortKey = 'name' | 'registerDate' | 'firstDepositAmount' | 'depositTotal' | 'withdrawalTotal' | 'pnl' | 'lastActivityAt';
type SortDir = 'asc' | 'desc';

const NUM_KEYS: SortKey[] = ['firstDepositAmount', 'depositTotal', 'withdrawalTotal', 'pnl'];
const DATE_KEYS: SortKey[] = ['registerDate', 'lastActivityAt'];

function compareRows(a: UserRow, b: UserRow, key: SortKey, dir: SortDir): number {
  const mult = dir === 'asc' ? 1 : -1;
  if (key === 'name') return mult * (a.name ?? a.userId).localeCompare(b.name ?? b.userId);
  if (NUM_KEYS.includes(key)) {
    const av = (a[key] as number | null) ?? -Infinity;
    const bv = (b[key] as number | null) ?? -Infinity;
    return mult * (av - bv);
  }
  // date keys: nulls sort last regardless of direction
  const at = a[key] ? new Date(a[key] as string).getTime() : null;
  const bt = b[key] ? new Date(b[key] as string).getTime() : null;
  if (at === null && bt === null) return 0;
  if (at === null) return 1;
  if (bt === null) return -1;
  return mult * (at - bt);
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visibleCount, setVisibleCount] = useState(100);
  const [sortKey, setSortKey] = useState<SortKey>('depositTotal');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<UserRow | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [tablePreset, setTablePreset] = useState<RangePreset>('all');
  const [tableFrom, setTableFrom] = useState(today);
  const [tableTo, setTableTo] = useState(today);

  const query = useQuery({
    queryKey: ['user-analytics'],
    queryFn: fetchAnalytics,
    refetchInterval: 60_000,
  });

  const tableRange = useMemo(
    () => resolveUiRange(tablePreset, tableFrom, tableTo),
    [tablePreset, tableFrom, tableTo]
  );

  const scoped = tablePreset !== 'all';
  const breakdownQuery = useQuery({
    queryKey: ['user-breakdown', tableRange?.from, tableRange?.to],
    queryFn: () => fetchBreakdown(tableRange!.from as string, tableRange!.to),
    enabled: scoped && Boolean(tableRange?.from),
    refetchInterval: 60_000,
  });

  const data = query.data;
  const t = data?.totals;
  const tableSource = scoped ? (breakdownQuery.data ?? []) : (data?.users ?? []);

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tableSource.filter((r) => {
      if (statusFilter === 'depositors' && !r.depositor) return false;
      if (statusFilter !== 'all' && statusFilter !== 'depositors' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.mobile ?? '').toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q)
      );
    });
  }, [tableSource, search, statusFilter]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [filtered, sortKey, sortDir]
  );

  const rows = sorted.slice(0, visibleCount);
  const notSetup = data && data.configured === false;

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(DATE_KEYS.includes(key) || NUM_KEYS.includes(key) ? 'desc' : 'asc');
      return key;
    });
  }, []);

  const downloadCsv = useCallback(() => {
    const head = 'User_ID,Name,Mobile,Registered,First_Deposit_Amount,First_Deposit_Date,Deposits,Deposit_Count,Withdrawals,Withdrawal_Count,PnL,Last_Active,Status,Last_Remark\n';
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const body = sorted.map((r) => [
      r.userId, esc(r.name ?? ''), r.mobile ?? '', r.registerDate ?? '',
      r.firstDepositAmount ?? '', r.firstDepositAt ?? '',
      r.depositTotal, r.depositCount, r.withdrawalTotal, r.withdrawalCount, r.pnl,
      r.lastActivityAt ?? '', r.status, esc(r.lastRemark ?? ''),
    ].join(',')).join('\n');
    const blob = new Blob([head + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted]);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <div className="topbar">
          <div>
            <h1 className="page-title">User Analytics</h1>
            <p className="page-sub">
              Registrations, first deposits, activity &amp; per-user P/L — from live transaction data.
            </p>
          </div>
          <div className="topbar-actions">
            <button className="btn-ghost" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw size={15} className={query.isFetching ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn-ghost" onClick={logout}><LogOut size={15} /> Logout</button>
          </div>
        </div>

        {query.isError ? (
          <div className="banner2">Could not load analytics: {(query.error as Error).message}</div>
        ) : null}

        {notSetup ? (
          <div className="panel">
            <div className="empty2">
              Data tables not found. Run <code>sql/schema.sql</code> in Supabase, then upload users and let the
              deposit/withdrawal webhooks flow in.
            </div>
          </div>
        ) : (
          <>
            <CsvMatch />

            {/* AUDIENCE / REGISTRATION */}
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <MiniCard label="Registered Users" value={(t?.registeredUsers ?? 0).toLocaleString('en-IN')}
                sub={`+${t?.newRegistrations30d ?? 0} in 30d · +${t?.newRegistrations7d ?? 0} in 7d`}
                color="#4f46e5" icon={<UsersRound size={20} />} />
              <MiniCard label="Depositors (FTD made)" value={(t?.depositors ?? 0).toLocaleString('en-IN')}
                sub={`${t?.ftdConversionPct ?? 0}% of registered converted`}
                color="#059669" icon={<UserCheck size={20} />} />
              <MiniCard label="Never Deposited" value={(t?.neverDeposited ?? 0).toLocaleString('en-IN')}
                sub="registered · no approved deposit" color="#ca8a04" icon={<UserPlus size={20} />} />
              <MiniCard label="Avg First Deposit" value={money(t?.avgFirstDeposit ?? 0)}
                sub="mean FTD amount" color="#7c3aed" icon={<BadgeIndianRupee size={20} />} />
            </div>

            {/* ACTIVITY */}
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <MiniCard label="Active Today" value={(t?.activeUsersToday ?? 0).toLocaleString('en-IN')}
                sub="transacted since midnight (IST)" color="#0ea5e9" icon={<TrendingUp size={20} />} />
              <MiniCard label="Active (7d)" value={(t?.activeUsers7d ?? 0).toLocaleString('en-IN')}
                sub="transacted in last 7 days" color="#16a34a" icon={<TrendingUp size={20} />} />
              <MiniCard label="Active (30d)" value={(t?.activeUsers30d ?? 0).toLocaleString('en-IN')}
                sub="transacted in last 30 days" color="#2563eb" icon={<UsersRound size={20} />} />
              <MiniCard label="Dormant Depositors" value={(t?.dormantDepositors ?? 0).toLocaleString('en-IN')}
                sub="deposited before · silent 30d+" color="#dc2626" icon={<TrendingDown size={20} />} />
              <MiniCard label="Net P/L (house)" value={money(t?.netPnl ?? 0)}
                sub={`${money(t?.depositTotal ?? 0)} in − ${money(t?.withdrawalTotal ?? 0)} out`}
                color="#0f766e" icon={<CircleDollarSign size={20} />} />
            </div>

            <ActiveUsers />

            {/* REGISTRATIONS vs FIRST DEPOSITS TREND */}
            <div className="panel">
              <div className="panel-head">
                <h3>Registrations &amp; First Deposits</h3>
                <div className="chart-legend">
                  <span className="legend-item"><i style={{ background: '#4f46e5' }} /> Registrations</span>
                  <span className="legend-item"><i style={{ background: '#059669' }} /> First deposits</span>
                  <span className="panel-tag">last 30 days (IST)</span>
                </div>
              </div>
              {data?.trend?.length ? <TrendLines points={data.trend} /> : <div className="empty2">{query.isLoading ? 'Loading…' : 'No trend data.'}</div>}
            </div>

            {/* PER-USER TABLE */}
            <div className="panel">
              <div className="panel-head">
                <h3>Per-User Breakdown</h3>
                <div className="txn-toolbar">
                  <label className="txn-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setVisibleCount(100); }}
                      placeholder="Search name, mobile or user ID"
                      aria-label="Search users"
                    />
                  </label>
                  <div className="txn-filters">
                    {(['all', 'depositors', 'active', 'lapsed', 'dormant', 'registered_only'] as const).map((f) => (
                      <button
                        key={f}
                        className={`txn-filter${statusFilter === f ? ' active' : ''}`}
                        onClick={() => { setStatusFilter(f); setVisibleCount(100); }}
                      >
                        {f === 'all' ? 'all' : f === 'depositors' ? 'depositors' : STATUS_LABEL[f]}
                      </button>
                    ))}
                  </div>
                  <button className="btn-ghost" onClick={downloadCsv} disabled={!sorted.length}>
                    <Download size={15} /> Download CSV
                  </button>
                </div>
              </div>

              {/* DATE-RANGE SCOPE for the table numbers */}
              <div className="txn-toolbar ua-scopebar">
                <div className="txn-filters">
                  {RANGE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      className={`txn-filter${tablePreset === p.key ? ' active' : ''}`}
                      onClick={() => { setTablePreset(p.key); setVisibleCount(100); }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {tablePreset === 'custom' ? (
                  <div className="txn-toolbar" style={{ gap: 10 }}>
                    <label className="date-field">From<input type="date" value={tableFrom} max={today} onChange={(e) => setTableFrom(e.target.value)} /></label>
                    <label className="date-field">To<input type="date" value={tableTo} max={today} onChange={(e) => setTableTo(e.target.value)} /></label>
                  </div>
                ) : null}
                <span className="panel-note" style={{ margin: 0 }}>
                  {scoped
                    ? `Deposits / Withdrawals / P/L shown for ${tableRange?.label ?? 'this range'} · ${filtered.length.toLocaleString('en-IN')} active users`
                    : 'Showing lifetime totals per user'}
                  {scoped && breakdownQuery.isFetching ? ' · loading…' : ''}
                </span>
              </div>

              {rows.length ? (
                <div className="ua-table">
                  <div className="ua-head">
                    <SortTh label="User" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Registered" k="registerDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="First Deposit" k="firstDepositAmount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Deposits" k="depositTotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Withdrawals" k="withdrawalTotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="P/L" k="pnl" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Last Active" k="lastActivityAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <span>Status</span><span>Last Remark</span>
                  </div>
                  {rows.map((r) => (
                    <div className="ua-row ua-row-click" key={r.userId} onClick={() => setSelected(r)} title="View transactions">
                      <span className="ua-user" title={r.userId}>
                        <b>{r.name ?? r.userId}</b>
                        <small>{r.mobile ?? r.userId}</small>
                      </span>
                      <span className="txn-mono">{dateShort(r.registerDate)}</span>
                      <span className="txn-mono" title={r.firstDepositAt ?? ''}>
                        {r.firstDepositAmount != null ? `${money(r.firstDepositAmount)} · ${dateShort(r.firstDepositAt)}` : '—'}
                      </span>
                      <span className="txn-amt">{r.depositCount ? `${money(r.depositTotal)}` : '—'}<small className="ua-count">{r.depositCount ? ` ×${r.depositCount}` : ''}</small></span>
                      <span className="txn-amt">{r.withdrawalCount ? `${money(r.withdrawalTotal)}` : '—'}<small className="ua-count">{r.withdrawalCount ? ` ×${r.withdrawalCount}` : ''}</small></span>
                      <span className={`txn-amt ${r.pnl >= 0 ? 'ua-pos' : 'ua-neg'}`}>{money(r.pnl)}</span>
                      <span className="txn-mono">{dateShort(r.lastActivityAt)}</span>
                      <span className={`notif-status ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      <span className="ua-remark" title={r.lastRemark ?? ''}>{r.lastRemark ?? '—'}</span>
                    </div>
                  ))}
                  {filtered.length > rows.length ? (
                    <div className="txn-load-more">
                      <span>Showing {rows.length} of {filtered.length.toLocaleString('en-IN')}</span>
                      <button onClick={() => setVisibleCount((c) => c + 100)}>Load more</button>
                    </div>
                  ) : (
                    <div className="txn-load-more"><span>Showing all {filtered.length.toLocaleString('en-IN')}</span></div>
                  )}
                </div>
              ) : (
                <div className="empty2">
                  {(scoped ? breakdownQuery.isLoading : query.isLoading)
                    ? 'Loading…'
                    : scoped
                      ? `No users were active in ${tableRange?.label ?? 'this range'}.`
                      : 'No users match this search or filter.'}
                </div>
              )}
            </div>

            <div className="footer-note">
              P/L is house net (approved deposits − approved withdrawals). Activity = transaction activity.
              {data?.generatedAt ? ` Updated ${new Date(data.generatedAt).toLocaleTimeString('en-IN')}.` : ''}
            </div>
          </>
        )}
      </main>

      {selected ? (
        <UserDetail
          userId={selected.userId}
          name={selected.name}
          mobile={selected.mobile}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function SortTh({ label, k, sortKey, sortDir, onSort }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <span className={`ua-th${active ? ' ua-th-active' : ''}`} onClick={() => onSort(k)} role="button">
      {label}
      {active ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} />}
    </span>
  );
}

function MiniCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: ReactNode;
}) {
  return (
    <div className="kpi" style={{ '--accent': color } as CSSProperties}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-delta"><span className="kpi-vs">{sub}</span></div>
      </div>
    </div>
  );
}
