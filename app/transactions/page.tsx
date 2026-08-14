'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import type { CSSProperties, ReactNode } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  CircleHelp,
  CircleX,
  Download,
  LogOut,
  Search,
  Upload,
} from 'lucide-react';
import {
  TRANSACTION_RANGE_OPTIONS,
  type TransactionRangeKey,
} from '@/lib/transaction-range';

type Row = {
  id: number;
  type: 'deposit' | 'withdrawal';
  transaction_id: string | null;
  user_name: string | null;
  user_id: string | null;
  mobile_number: string | null;
  amount: number | null;
  payment_status: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  utr_number: string | null;
  created_at: string;
  display_status: 'approved' | 'rejected' | 'pending' | 'unconfirmed';
  status_label: string;
  status_source: 'webhook' | 'statement' | 'statement_absence' | 'none';
  statement_date: string | null;
  statement_only?: boolean;
};
type Data = {
  configured: boolean;
  error?: string;
  range?: {
    key: TransactionRangeKey;
    label: string;
    from: string | null;
    to: string;
  };
  statement?: {
    configured: boolean;
    checkedUsers: number;
    failedUsers: number;
    limited: boolean;
    knownUsers: number;
    processedInCycle: number;
    completedCycles: number;
    coverageComplete: boolean;
    lastRunAt: string | null;
    syncError: string | null;
  };
  summary?: {
    depositCount: number;
    depositTotalAmount: number;
    depositApprovedCount: number;
    depositApprovedAmount: number;
    depositRejectedCount: number;
    depositRejectedAmount: number;
    depositRejectedExplicitCount: number;
    depositRejectedByAbsenceCount: number;
    depositRejectedByDay: Array<{ date: string; count: number }>;
    depositUnconfirmedCount: number;
    depositUnconfirmedAmount: number;
    withdrawalCount: number;
    withdrawalApprovedAmount: number;
    withdrawalUnconfirmedAmount: number;
  };
  recent?: Row[];
};

const money = (n: number) => `₹${n.toLocaleString()}`;
const statusClass = (status: Row['display_status']) =>
  status === 'approved' ? 's-completed' : status === 'rejected' ? 's-failed' : status === 'pending' ? 's-scheduled' : 's-sent';

async function fetchTransactionData(range: TransactionRangeKey): Promise<Data> {
  const response = await fetch(`/api/transactions?range=${range}`, { cache: 'no-store' });
  const body = await response.json() as Data;
  if (!response.ok) throw new Error(body.error || 'Transaction data is temporarily unavailable');
  return body;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [range, setRange] = useState<TransactionRangeKey>('today');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const transactionQuery = useQuery({
    queryKey: ['transactions', range],
    queryFn: () => fetchTransactionData(range),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
  });
  const data = transactionQuery.data;

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const s = data?.summary;
  const queryError = transactionQuery.error instanceof Error
    ? transactionQuery.error.message
    : data?.error;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = (data?.recent ?? []).filter((row) => {
    if (filter !== 'all' && row.type !== filter) return false;
    if (!normalizedSearch) return true;
    return [
      row.user_id,
      row.user_name,
      row.mobile_number,
      row.transaction_id,
      row.amount != null ? String(row.amount) : null,
    ].some((value) => value?.toLowerCase().includes(normalizedSearch));
  });
  const rows = filteredRows.slice(0, visibleCount);
  const notSetup = data?.configured === false;

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Transactions</h1>
            <p className="page-sub">Reconciled payment requests and settled wallet activity · {data?.range?.label ?? 'Today (IST)'}</p>
          </div>
          <div className="topbar-actions">
            <label className="date-pill range-picker">
              <CalendarDays size={15} />
              <select
                className="range-select"
                aria-label="Transaction time period"
                value={range}
                onChange={(event) => {
                  setRange(event.target.value as TransactionRangeKey);
                  setVisibleCount(50);
                }}
              >
                {TRANSACTION_RANGE_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <button className="logout-btn2" onClick={logout}><LogOut size={15} /><span>Log out</span></button>
          </div>
        </header>

        {queryError && data?.configured !== false ? (
          <div className="banner2">Transaction data error: {queryError}. Showing the last successful result when available.</div>
        ) : null}

        {data?.statement && !data.statement.configured ? (
          <div className="banner2">Statement verification is not configured in this environment. Webhook status is shown when available.</div>
        ) : null}
        {data?.statement && data.statement.failedUsers > 0 ? (
          <div className="banner2">Could not verify {data.statement.failedUsers} user statement{data.statement.failedUsers === 1 ? '' : 's'} during this refresh. Their transactions remain unconfirmed.</div>
        ) : null}
        {data?.statement?.syncError ? (
          <div className="banner2">Saved statement sync could not continue during this refresh: {data.statement.syncError}. Previously saved results are still shown.</div>
        ) : null}
        {data?.statement?.limited ? (
          <div className="banner2">
            {data.statement.knownUsers > 0
              ? `Full statement sync is running: ${data.statement.processedInCycle} of ${data.statement.knownUsers} known users checked in this pass. Saved results remain available; withdrawal totals may be partial until the first pass finishes.`
              : `Statement coverage is temporarily limited to ${data.statement.checkedUsers} recent users. Withdrawal totals may be partial.`}
          </div>
        ) : null}
        {(s?.depositRejectedByAbsenceCount ?? 0) > 0 ? (
          <div className="banner2">
            Rejection rule active: a webhook deposit absent from the final Statement API after five hours is rejected.
            {' '}Current breakdown: {(s?.depositRejectedByDay ?? []).map((item) => `${item.date}: ${item.count}`).join(' · ')}.
          </div>
        ) : null}

        {notSetup ? (
          <div className="panel">
            <div className="empty2">
              Transactions table not found. Run <code>sql/transactions.sql</code> in Supabase, then point the
              platform&apos;s <b>deposit_url</b> / <b>withdrawal_url</b> at your webhook endpoints.
            </div>
          </div>
        ) : (
          <>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <MiniCard label="Deposit Requests" value={String(s?.depositCount ?? 0)} sub={`${money(s?.depositTotalAmount ?? 0)} total`} color="#4f46e5" icon={<Download size={20} />} />
              <MiniCard label="Approved Deposits" value={String(s?.depositApprovedCount ?? 0)} sub={`${money(s?.depositApprovedAmount ?? 0)} confirmed`} color="#059669" icon={<BadgeCheck size={20} />} />
              <MiniCard label="Rejected Deposits" value={String(s?.depositRejectedCount ?? 0)} sub={`${money(s?.depositRejectedAmount ?? 0)} · ${s?.depositRejectedByAbsenceCount ?? 0} absent after 5h`} color="#dc2626" icon={<CircleX size={20} />} />
              <MiniCard label="Pending / Unconfirmed" value={String(s?.depositUnconfirmedCount ?? 0)} sub={`${money(s?.depositUnconfirmedAmount ?? 0)} awaiting settlement`} color="#ca8a04" icon={<CircleHelp size={20} />} />
              <MiniCard label="Withdrawals" value={String(s?.withdrawalCount ?? 0)} sub={`${money(s?.withdrawalApprovedAmount ?? 0)} approved`} color="#2563eb" icon={<Upload size={20} />} />
              <MiniCard label="Withdrawal Unconfirmed" value={money(s?.withdrawalUnconfirmedAmount ?? 0)} sub="pending / unmatched" color="#7c3aed" icon={<CircleHelp size={20} />} />
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>Recent Transactions</h3>
                <div className="txn-toolbar">
                  <label className="txn-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setVisibleCount(50);
                      }}
                      placeholder="Search user or transaction"
                      aria-label="Search transactions"
                    />
                  </label>
                  <div className="txn-filters">
                    {(['all', 'deposit', 'withdrawal'] as const).map((f) => (
                      <button
                        key={f}
                        className={`txn-filter${filter === f ? ' active' : ''}`}
                        onClick={() => {
                          setFilter(f);
                          setVisibleCount(50);
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {rows.length ? (
                <div className="txn-table">
                  <div className="txn-head">
                    <span>Type</span><span>Txn ID</span><span>User</span><span>Mobile</span><span>Amount</span><span>Details</span><span>Status</span>
                  </div>
                  {rows.map((r) => (
                    <div className="txn-row" key={r.id}>
                      <span className={`txn-type t-${r.type}`}>{r.type}</span>
                      <span className="txn-mono" title={r.transaction_id ?? ''}>{r.statement_only ? 'statement only' : r.transaction_id ?? '—'}</span>
                      <span title={r.user_name ?? ''}>{r.user_name ?? r.user_id ?? '—'}</span>
                      <span className="txn-mono">{r.mobile_number ?? '—'}</span>
                      <span className="txn-amt">{r.amount != null ? money(r.amount) : '—'}</span>
                      <span className="txn-mono" title={r.account_number ? `A/C ${r.account_number} · ${r.ifsc_code ?? ''}` : r.utr_number ?? ''}>
                        {r.account_number ? `A/C ••${r.account_number.slice(-4)}` : r.utr_number ? `UTR ${r.utr_number}` : '—'}
                      </span>
                      <span
                        className={`notif-status ${statusClass(r.display_status)}`}
                        title={r.status_source === 'statement' && r.statement_date
                          ? `Confirmed in wallet statement at ${r.statement_date}`
                          : r.status_source === 'statement_absence' ? 'No matching settled deposit was found after five hours'
                            : r.status_source === 'webhook' ? 'Status supplied by webhook' : 'No final status supplied'}
                      >
                        {r.status_label}
                      </span>
                    </div>
                  ))}
                  {filteredRows.length > rows.length ? (
                    <div className="txn-load-more">
                      <span>Showing {rows.length} of {filteredRows.length}</span>
                      <button onClick={() => setVisibleCount((count) => count + 50)}>Load more</button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="empty2">
                  {data?.recent?.length
                    ? 'No transactions match this search or filter.'
                    : 'No transactions yet. Once the platform’s webhook URLs point here, deposits and withdrawals appear live.'}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function MiniCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: ReactNode }) {
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
