'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { CsvMatch } from '@/components/CsvMatch';
import { UserDetail } from '@/components/UserDetail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RANGE_PRESETS, resolveUiRange, type RangePreset } from '@/lib/ui-range';
import type { UserAnalytics, UserRow, UserStatus } from '@/lib/user-analytics';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Send,
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

type StatusFilter = 'all' | UserStatus | 'depositors' | 'dormant_depositors' | 'non_depositors';

const FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'depositors', label: 'Depositors' },
  { key: 'non_depositors', label: 'Never deposited' },
  { key: 'dormant_depositors', label: 'Dormant depositors' },
  { key: 'active', label: 'Active' },
  { key: 'lapsed', label: 'Lapsed' },
  { key: 'dormant', label: 'Dormant' },
  { key: 'registered_only', label: 'No activity' },
];
type SortKey = 'name' | 'registerDate' | 'firstDepositAmount' | 'depositTotal' | 'withdrawalTotal' | 'pnl' | 'lossCommission' | 'lastActivityAt';
type SortDir = 'asc' | 'desc';

const NUM_KEYS: SortKey[] = ['firstDepositAmount', 'depositTotal', 'withdrawalTotal', 'pnl'];
const DATE_KEYS: SortKey[] = ['registerDate', 'lastActivityAt'];

// Loss commission = 3% of the player's net loss (deposits − withdrawals), only
// when they are net-down. No commission when the player is net-up.
const LOSS_COMMISSION_RATE = 0.03;
const lossCommission = (pnl: number) => (pnl > 0 ? Math.round(pnl * LOSS_COMMISSION_RATE) : 0);

function compareRows(a: UserRow, b: UserRow, key: SortKey, dir: SortDir): number {
  const mult = dir === 'asc' ? 1 : -1;
  if (key === 'name') return mult * (a.name ?? a.userId).localeCompare(b.name ?? b.userId);
  if (key === 'lossCommission') return mult * (lossCommission(a.pnl) - lossCommission(b.pnl));
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
  const [masterFilter, setMasterFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>('depositTotal');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<UserRow | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
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

  const [winbackSending, setWinbackSending] = useState(false);
  const [winbackMsg, setWinbackMsg] = useState('');

  const dormantPreview = useQuery({
    queryKey: ['dormant-preview'],
    enabled: statusFilter === 'dormant_depositors',
    queryFn: async () => {
      const res = await fetch('/api/campaigns/dormant', { cache: 'no-store' });
      return res.json() as Promise<{ configured: boolean; eligible?: number; dormant?: number; skippedCooldown?: number; error?: string }>;
    },
  });

  const sendWinback = useCallback(async () => {
    const eligible = dormantPreview.data?.eligible ?? 0;
    if (!eligible) return;
    if (!window.confirm(
      `Send a WhatsApp win-back message to ${eligible} eligible dormant depositors now?\n\n` +
      `• Capped at 200 per run\n• Users messaged in the last 14 days are skipped\n• This sends real marketing messages.`
    )) return;
    setWinbackSending(true);
    setWinbackMsg('');
    try {
      const res = await fetch('/api/campaigns/dormant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 200 }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || 'Send failed');
      setWinbackMsg(`Sent ${b.sent} · failed ${b.failed} · skipped ${b.skipped}.`);
      void dormantPreview.refetch();
    } catch (e) {
      setWinbackMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setWinbackSending(false);
    }
  }, [dormantPreview]);

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

  // Distinct Master / Branch IDs for the "Select Master" filter.
  const masters = useMemo(
    () => Array.from(new Set((data?.users ?? []).map((u) => u.branchId).filter((b): b is string => Boolean(b)))).sort(),
    [data]
  );

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tableSource.filter((r) => {
      if (statusFilter === 'depositors' && !r.depositor) return false;
      if (statusFilter === 'non_depositors' && r.depositor) return false;
      if (statusFilter === 'dormant_depositors' && !(r.depositor && r.status === 'dormant')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'depositors' && statusFilter !== 'non_depositors' && statusFilter !== 'dormant_depositors' && r.status !== statusFilter) return false;
      if (masterFilter && r.branchId !== masterFilter) return false;
      if (!q) return true;
      return (
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.mobile ?? '').toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q)
      );
    });
  }, [tableSource, search, statusFilter, masterFilter]);

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

  const showDormantDepositors = useCallback(() => {
    setTablePreset('all');            // lifetime view
    setStatusFilter('dormant_depositors');
    setSortKey('depositTotal');
    setSortDir('desc');
    setVisibleCount(100);
    setSearch('');
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  const downloadCsv = useCallback(() => {
    const head = 'User_ID,Master_ID,Name,Mobile,Registered,First_Deposit_Amount,First_Deposit_Date,Deposits,Deposit_Count,Withdrawals,Withdrawal_Count,PnL,Loss_Commission_3pct,Last_Active,Status,Last_Remark\n';
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const body = sorted.map((r) => [
      r.userId, r.branchId ?? '', esc(r.name ?? ''), r.mobile ?? '', r.registerDate ?? '',
      r.firstDepositAmount ?? '', r.firstDepositAt ?? '',
      r.depositTotal, r.depositCount, r.withdrawalTotal, r.withdrawalCount, r.pnl, lossCommission(r.pnl),
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

  const totalLossComm = useMemo(
    () => (data?.users ?? []).reduce((s, r) => s + lossCommission(r.pnl), 0),
    [data]
  );

  // Left-rail clicks: apply a lifetime status filter, or an activity date scope.
  const railFilter = useCallback((f: StatusFilter) => {
    setStatusFilter(f); setTablePreset('all'); setVisibleCount(100);
  }, []);
  const railActive = useCallback((preset: RangePreset) => {
    setTablePreset(preset); setStatusFilter('all'); setVisibleCount(50);
  }, []);
  // Scope the table to today and sort by the chosen money column.
  const railToday = useCallback((key: SortKey) => {
    setTablePreset('today'); setStatusFilter('all'); setSortKey(key); setSortDir('desc'); setVisibleCount(50);
  }, []);

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

            {/* REPORT LAYOUT: left metric rail (Get-ID style) + right table */}
            <div className="report-layout">
              <aside className="report-rail">
                <div className="report-group-title">Overview</div>
                <button className={`report-item${statusFilter === 'all' && !scoped ? ' active' : ''}`} onClick={() => railFilter('all')}>
                  <span>Registered Users</span><span className="report-badge">{(t?.registeredUsers ?? 0).toLocaleString('en-IN')}</span>
                </button>
                <button className={`report-item${statusFilter === 'depositors' ? ' active' : ''}`} onClick={() => railFilter('depositors')}>
                  <span>Depositors (FTD)</span><span className="report-badge report-badge-ok">{(t?.depositors ?? 0).toLocaleString('en-IN')}</span>
                </button>
                <button className={`report-item${statusFilter === 'non_depositors' ? ' active' : ''}`} onClick={() => railFilter('non_depositors')}>
                  <span>Never Deposited</span><span className="report-badge">{(t?.neverDeposited ?? 0).toLocaleString('en-IN')}</span>
                </button>
                <div className="report-item report-item-static">
                  <span>Avg First Deposit</span><span className="report-badge">{money(t?.avgFirstDeposit ?? 0)}</span>
                </div>

                <div className="report-group-title">Activity</div>
                <button className={`report-item${scoped && tablePreset === 'today' ? ' active' : ''}`} onClick={() => railActive('today')}>
                  <span>Active Today</span><span className="report-badge">{(t?.activeUsersToday ?? 0).toLocaleString('en-IN')}</span>
                </button>
                <button className={`report-item${scoped && tablePreset === '7d' ? ' active' : ''}`} onClick={() => railActive('7d')}>
                  <span>Active 7 Days</span><span className="report-badge">{(t?.activeUsers7d ?? 0).toLocaleString('en-IN')}</span>
                </button>
                <button className={`report-item${scoped && tablePreset === '30d' ? ' active' : ''}`} onClick={() => railActive('30d')}>
                  <span>Active 30 Days</span><span className="report-badge">{(t?.activeUsers30d ?? 0).toLocaleString('en-IN')}</span>
                </button>
                <button className={`report-item${statusFilter === 'dormant_depositors' ? ' active' : ''}`} onClick={showDormantDepositors}>
                  <span>Dormant Depositors</span><span className="report-badge report-badge-warn">{(t?.dormantDepositors ?? 0).toLocaleString('en-IN')}</span>
                </button>

                <div className="report-group-title">Today</div>
                <button className={`report-item${scoped && tablePreset === 'today' && sortKey === 'depositTotal' ? ' active' : ''}`} onClick={() => railToday('depositTotal')}>
                  <span>Today Deposit</span><span className="report-badge report-badge-ok">{money(t?.todayDepositTotal ?? 0)}</span>
                </button>
                <button className={`report-item${scoped && tablePreset === 'today' && sortKey === 'withdrawalTotal' ? ' active' : ''}`} onClick={() => railToday('withdrawalTotal')}>
                  <span>Today Withdrawal</span><span className="report-badge">{money(t?.todayWithdrawalTotal ?? 0)}</span>
                </button>

                <div className="report-group-title">Money</div>
                <div className="report-item report-item-static"><span>Total Deposits</span><span className="report-badge">{money(t?.depositTotal ?? 0)}</span></div>
                <div className="report-item report-item-static"><span>Total Withdrawals</span><span className="report-badge">{money(t?.withdrawalTotal ?? 0)}</span></div>
                <div className="report-item report-item-static"><span>Net P/L (house)</span><span className="report-badge">{money(t?.netPnl ?? 0)}</span></div>
                <div className="report-item report-item-static"><span>Loss Commission 3%</span><span className="report-badge">{money(totalLossComm)}</span></div>
              </aside>

              <div className="report-main">
                {/* PER-USER TABLE */}
                <div className="panel" ref={tableRef}>
              <div className="panel-head"><h3>Per-User Breakdown</h3></div>

              {/* Get-ID style filter bar (shadcn/ui) */}
              <div className="report-filterbar">
                <label className="ff ff-grow">User ID
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setVisibleCount(50); }} placeholder="Search name, mobile or user ID" />
                  </div>
                </label>
                <label className="ff">Segment
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setVisibleCount(50); }}>
                    <SelectTrigger className="w-[168px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{FILTER_OPTIONS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="ff">Select Master
                  <Select value={masterFilter || 'ALL'} onValueChange={(v) => { setMasterFilter(v === 'ALL' ? '' : v); setVisibleCount(50); }}>
                    <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Masters</SelectItem>
                      {masters.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="ff">Select by Date
                  <Select value={tablePreset} onValueChange={(v) => { setTablePreset(v as RangePreset); setVisibleCount(50); }}>
                    <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{RANGE_PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="ff">Order by
                  <Select value={`${sortKey}:${sortDir}`} onValueChange={(v) => { const [k, d] = v.split(':'); setSortKey(k as SortKey); setSortDir(d as SortDir); }}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="depositTotal:desc">Deposits ↓</SelectItem>
                      <SelectItem value="withdrawalTotal:desc">Withdrawals ↓</SelectItem>
                      <SelectItem value="pnl:desc">P/L ↓</SelectItem>
                      <SelectItem value="lossCommission:desc">Loss Comm ↓</SelectItem>
                      <SelectItem value="firstDepositAmount:desc">First Deposit ↓</SelectItem>
                      <SelectItem value="registerDate:desc">Newest reg ↓</SelectItem>
                      <SelectItem value="lastActivityAt:desc">Recently active ↓</SelectItem>
                      <SelectItem value="name:asc">Name A–Z</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {tablePreset === 'custom' ? (
                  <>
                    <label className="ff">From<Input type="date" className="w-[150px]" value={tableFrom} max={today} onChange={(e) => setTableFrom(e.target.value)} /></label>
                    <label className="ff">To<Input type="date" className="w-[150px]" value={tableTo} max={today} onChange={(e) => setTableTo(e.target.value)} /></label>
                  </>
                ) : null}
                <Button onClick={() => { void query.refetch(); if (scoped) void breakdownQuery.refetch(); }}>Go</Button>
                <Button variant="outline" onClick={downloadCsv} disabled={!sorted.length}><Download className="h-3.5 w-3.5" /> CSV</Button>
              </div>
              <div className="report-scopenote">
                {scoped
                  ? `Showing ${tableRange?.label ?? 'range'} · ${filtered.length.toLocaleString('en-IN')} users`
                  : `Lifetime totals · ${filtered.length.toLocaleString('en-IN')} users`}
                {masterFilter ? ` · Master ${masterFilter}` : ''}
                {scoped && breakdownQuery.isFetching ? ' · loading…' : ''}
              </div>

              {statusFilter === 'dormant_depositors' ? (
                <div className="banner2 banner-ok" style={{ margin: '12px 0 0' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                    <span>
                      <b>{filtered.length.toLocaleString('en-IN')} dormant depositors</b> — deposited before but silent 30d+.
                      {dormantPreview.data?.configured === false
                        ? ' Campaign key not set — set INTERAKT_CAMPAIGN_API_KEY to send.'
                        : dormantPreview.data
                          ? ` ${dormantPreview.data.eligible ?? 0} eligible to message now (rest are within the 14-day cooldown).`
                          : dormantPreview.isFetching ? ' Checking eligibility…' : ''}
                    </span>
                    <button
                      className="btn-primary"
                      disabled={winbackSending || !dormantPreview.data?.eligible}
                      onClick={sendWinback}
                    >
                      {winbackSending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                      {winbackSending ? 'Sending…' : `Send win-back to ${dormantPreview.data?.eligible ?? 0}`}
                    </button>
                  </div>
                  {winbackMsg ? <div style={{ marginTop: 8, fontWeight: 600 }}>{winbackMsg}</div> : null}
                  <div style={{ marginTop: 6, fontSize: 11.5, opacity: 0.85 }}>
                    Or <b>Download CSV</b> above to use in <a href="/campaigns">Campaigns</a>. Automatic daily sends run via the win-back cron when Campaigns is enabled.
                  </div>
                </div>
              ) : null}

              {rows.length ? (
                <>
                <div className="ua-scroll">
                  <div className="ua-table">
                  <div className="ua-head">
                    <span>S.No</span>
                    <SortTh label="User" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <span>Master ID</span>
                    <SortTh label="Registered" k="registerDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="First Deposit" k="firstDepositAmount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Deposits" k="depositTotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Withdrawals" k="withdrawalTotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="P/L" k="pnl" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Loss Comm. 3%" k="lossCommission" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Last Active" k="lastActivityAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <span>Status</span><span>Last Remark</span>
                  </div>
                  {rows.map((r, i) => (
                    <div className="ua-row ua-row-click" key={r.userId} onClick={() => setSelected(r)} title="View transactions">
                      <span className="txn-mono">{i + 1}</span>
                      <span className="ua-user" title={r.userId}>
                        <b>{r.name && r.name !== '0' ? r.name : r.userId}</b>
                        <small>{r.mobile ?? r.userId}</small>
                      </span>
                      <span className="txn-mono">{r.branchId ?? '—'}</span>
                      <span className="txn-mono">{dateShort(r.registerDate)}</span>
                      <span className="txn-mono" title={r.firstDepositAt ?? ''}>
                        {r.firstDepositAmount != null ? `${money(r.firstDepositAmount)} · ${dateShort(r.firstDepositAt)}` : '—'}
                      </span>
                      <span className="txn-amt">{r.depositCount ? money(r.depositTotal) : '—'}</span>
                      <span className="txn-amt">{r.withdrawalCount ? money(r.withdrawalTotal) : '—'}</span>
                      <span className={`txn-amt ${r.pnl >= 0 ? 'ua-pos' : 'ua-neg'}`}>{money(r.pnl)}</span>
                      <span className="txn-amt">{lossCommission(r.pnl) ? money(lossCommission(r.pnl)) : '—'}</span>
                      <span className="txn-mono">{dateShort(r.lastActivityAt)}</span>
                      <span className={`notif-status ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      <span className="ua-remark" title={r.lastRemark ?? ''}>{r.lastRemark ?? '—'}</span>
                    </div>
                  ))}
                  </div>
                </div>
                <div className="report-pager">
                  <span>Showing {Math.min(rows.length, filtered.length).toLocaleString('en-IN')} of {filtered.length.toLocaleString('en-IN')}</span>
                  <label>show
                    <select value={String(visibleCount)} onChange={(e) => setVisibleCount(Number(e.target.value))}>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                      <option value="100000">All</option>
                    </select>
                    entries
                  </label>
                </div>
                </>
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
              </div>
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

