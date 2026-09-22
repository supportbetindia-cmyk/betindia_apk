'use client';
import { logout } from '@/lib/logout';

import { useState } from 'react';
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
import { backendRequest, getSelectedTenantId } from '@/lib/backend-api';
import {
  TRANSACTION_RANGE_OPTIONS,
  resolveTransactionRange,
  type TransactionRangeKey,
} from '@/lib/transaction-range';

type Row = {
  id: string;
  type: 'deposit' | 'withdrawal';
  transaction_id: string | null;
  user_name: string | null;
  user_id: string | null;
  mobile_number: string | null;
  amount: number | null;
  created_at: string;
  display_status: 'approved' | 'rejected' | 'pending';
  status_label: string;
};
type Data = {
  summary: {
    depositCount: number;
    depositTotalAmount: number;
    depositApprovedCount: number;
    depositApprovedAmount: number;
    depositRejectedCount: number;
    depositRejectedAmount: number;
    depositPendingCount: number;
    depositPendingAmount: number;
    withdrawalCount: number;
    withdrawalApprovedAmount: number;
    withdrawalPendingAmount: number;
  };
  recent: Row[];
};

const money = (n: number) => `₹${n.toLocaleString()}`;
const statusClass = (status: Row['display_status']) =>
  status === 'approved' ? 's-completed' : status === 'rejected' ? 's-failed' : 's-scheduled';

// The active company is kept in the tenant header by backendRequest, so each
// company shows its own transactions from the backend (saas schema).
async function fetchTransactionData(range: TransactionRangeKey): Promise<Data> {
  const { from, to } = resolveTransactionRange(range);
  const query = `from=${from ?? ''}&to=${to}`;
  return backendRequest<Data>(`/transactions/summary?${query}`);
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [range, setRange] = useState<TransactionRangeKey>('today');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const tenantId = getSelectedTenantId();
  const transactionQuery = useQuery({
    // tenantId is in the key so switching company refetches instead of showing cache.
    queryKey: ['transactions', tenantId, range],
    queryFn: () => fetchTransactionData(range),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
  });
  const data = transactionQuery.data;
  const rangeLabel = resolveTransactionRange(range).label;

  const s = data?.summary;
  const queryError = transactionQuery.error instanceof Error
    ? transactionQuery.error.message
    : null;
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

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Transactions</h1>
            <p className="page-sub">Deposits and withdrawals for this company · {rangeLabel}</p>
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

        {queryError ? (
          <div className="banner2">Could not load transactions: {queryError}. Showing the last result when available.</div>
        ) : null}

        <>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <MiniCard label="Deposit Requests" value={String(s?.depositCount ?? 0)} sub={`${money(s?.depositTotalAmount ?? 0)} total`} color="#4f46e5" icon={<Download size={20} />} />
              <MiniCard label="Approved Deposits" value={String(s?.depositApprovedCount ?? 0)} sub={`${money(s?.depositApprovedAmount ?? 0)} confirmed`} color="#059669" icon={<BadgeCheck size={20} />} />
              <MiniCard label="Rejected Deposits" value={String(s?.depositRejectedCount ?? 0)} sub={`${money(s?.depositRejectedAmount ?? 0)} rejected`} color="#dc2626" icon={<CircleX size={20} />} />
              <MiniCard label="Pending Deposits" value={String(s?.depositPendingCount ?? 0)} sub={`${money(s?.depositPendingAmount ?? 0)} awaiting`} color="#ca8a04" icon={<CircleHelp size={20} />} />
              <MiniCard label="Withdrawals" value={String(s?.withdrawalCount ?? 0)} sub={`${money(s?.withdrawalApprovedAmount ?? 0)} approved`} color="#2563eb" icon={<Upload size={20} />} />
              <MiniCard label="Withdrawal Pending" value={money(s?.withdrawalPendingAmount ?? 0)} sub="not yet approved" color="#7c3aed" icon={<CircleHelp size={20} />} />
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
                    <span>Type</span><span>Txn ID</span><span>User</span><span>Mobile</span><span>Amount</span><span>Date</span><span>Status</span>
                  </div>
                  {rows.map((r) => (
                    <div className="txn-row" key={r.id}>
                      <span className={`txn-type t-${r.type}`}>{r.type}</span>
                      <span className="txn-mono" title={r.transaction_id ?? ''}>{r.transaction_id ?? '—'}</span>
                      <span title={r.user_name ?? ''}>{r.user_name ?? r.user_id ?? '—'}</span>
                      <span className="txn-mono">{r.mobile_number ?? '—'}</span>
                      <span className="txn-amt">{r.amount != null ? money(r.amount) : '—'}</span>
                      <span className="txn-mono" title={new Date(r.created_at).toLocaleString('en-IN')}>
                        {new Date(r.created_at).toLocaleDateString('en-IN')}
                      </span>
                      <span className={`notif-status ${statusClass(r.display_status)}`}>
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
