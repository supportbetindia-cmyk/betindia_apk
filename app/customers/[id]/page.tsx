'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Gift, Wallet } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useMasterFilter } from '@/components/MasterFilterProvider';
import { withMaster } from '@/lib/master-filter';
import { Badge } from '@/components/ui/badge';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { money as inr, day as fmtDay } from '@/lib/format';
import { backendRequest } from '@/lib/backend-api';

type ClassificationEvent = {
  id: string; dimension: string; oldValue: string | null; newValue: string | null; reason: string | null; changedAt: string;
};

type Customer360 = {
  customer: {
    id: string; externalUserId: string | null; masterId: string | null; name: string | null;
    phone: string | null; email: string | null; registrationAt: string | null; accountStatus: string | null;
    currentLifecycle: string | null; currentCategory: string | null;
  };
  classificationHistory: ClassificationEvent[];
  lifetime: {
    totalDeposits: number | null; depositCount: number | null;
    totalWithdrawals: number | null; withdrawalCount: number | null;
    netPnl: number | null; totalBonus: number | null;
    lastDepositAt: string | null; lastDepositAmount: number | null;
    lastWithdrawalAt: string | null; lastWithdrawalAmount: number | null;
  };
  ledger: {
    totalDeposits: number; depositCount: number; totalWithdrawals: number; withdrawalCount: number;
    lastDeposit: string | null; pl: number; daysSinceLastDeposit: number | null;
  };
  ftd: { date: string | null; amount: number | null; transactionId: string | null };
  today: { deposits: number; withdrawals: number };
};

type Transaction = {
  id: string; externalTransactionId: string | null; transactionType: 'DEPOSIT' | 'WITHDRAWAL';
  amount: string | number; currency: string; occurredAt: string; rawStatus: string | null;
  normalizedStatus: string; isFinanciallySuccessful: boolean; source: string;
};
type TransactionList = { data: Transaction[]; total: number };

// Player figures carry paise (2 decimals); missing values show a dash.
const money = (value: number | null | undefined) => inr(value, 2) || '—';
const day = (value: string | null | undefined) => fmtDay(value) || '—';

const GREEN = '#15803d';
const RED = '#b91c1c';

// Turn system words into everyday words.
const STATUS_WORDS: Record<string, string> = {
  APPROVED: 'Successful', PENDING: 'Waiting', REJECTED: 'Rejected', FAILED: 'Failed',
};
const STAGE_WORDS: Record<string, string> = {
  Lead: 'New lead', Registered: 'Signed up', FTD: 'First deposit done',
  'Repeat Depositor': 'Deposits again', 'Regular Player': 'Regular player',
  'At Risk': 'Going quiet', Inactive: 'Inactive',
};
const stageWord = (v: string | null) => (v ? STAGE_WORDS[v] ?? v : '—');

export default function Customer360Page() {
  const params = useParams<{ id: string }>();
  const { tenantId, masterId, scopedHref } = useMasterFilter();
  const customerQuery = useQuery({
    queryKey: ['backend-customer-360', tenantId, params.id, masterId],
    queryFn: ({ signal }) => backendRequest<Customer360>(scopedHref(`/customers/${params.id}`), { tenantId, signal }),
    enabled: Boolean(tenantId && params.id),
  });
  const transactionsQuery = useQuery({
    queryKey: ['backend-customer-transactions', tenantId, params.id, masterId],
    queryFn: ({ signal }) => backendRequest<TransactionList>(withMaster(`/customers/${params.id}/transactions?page=1&pageSize=100`, masterId), { tenantId, signal }),
    enabled: Boolean(tenantId && params.id),
  });
  const data = customerQuery.data;
  useAuthRedirect(customerQuery.error);

  // Prefer the lifetime totals from the report; fall back to what the live ledger has.
  const deposits = data ? (data.lifetime.totalDeposits ?? data.ledger.totalDeposits) : 0;
  const depositCount = data ? (data.lifetime.depositCount ?? data.ledger.depositCount) : 0;
  const withdrawals = data ? (data.lifetime.totalWithdrawals ?? data.ledger.totalWithdrawals) : 0;
  const withdrawalCount = data ? (data.lifetime.withdrawalCount ?? data.ledger.withdrawalCount) : 0;
  const profit = data ? (data.lifetime.netPnl ?? (deposits - withdrawals)) : 0;
  const name = data?.customer.name || 'This player';

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <Link href={scopedHref('/customers')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 13, marginBottom: 8 }}><ArrowLeft size={14} /> Back to all players</Link>
            <h1 className="page-title">{data?.customer.name || 'Player details'}</h1>
            <p className="page-sub">A simple summary of this player&apos;s money</p>
          </div>
        </header>

        {customerQuery.isError ? <div className="banner2">{customerQuery.error instanceof Error ? customerQuery.error.message : 'Could not load this player'}</div> : null}
        {customerQuery.isLoading ? <div className="panel"><div className="empty2">Loading…</div></div> : null}

        {data ? <>
          {/* One-line plain summary so anyone can read it at a glance. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderRadius: 12,
            background: profit >= 0 ? '#ecfdf3' : '#fef2f2', border: `1px solid ${profit >= 0 ? '#abefc6' : '#fecaca'}`,
            fontSize: 16, lineHeight: 1.5,
          }}>
            <Wallet size={22} color={profit >= 0 ? GREEN : RED} />
            <div>
              <b>{name}</b> put in <b>{money(deposits)}</b> and took out <b>{money(withdrawals)}</b>.{' '}
              {profit >= 0
                ? <>You are ahead by <b style={{ color: GREEN }}>{money(profit)}</b>.</>
                : <>You are behind by <b style={{ color: RED }}>{money(Math.abs(profit))}</b>.</>}
            </div>
          </div>

          {/* Big, clear numbers with everyday labels. */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 16 }}>
            <BigCard color={GREEN} icon={<ArrowDownCircle size={18} color={GREEN} />} label="Money added" value={money(deposits)} sub={`${depositCount ?? 0} times`} />
            <BigCard color={RED} icon={<ArrowUpCircle size={18} color={RED} />} label="Money taken out" value={money(withdrawals)} sub={`${withdrawalCount ?? 0} times`} />
            <BigCard color={profit >= 0 ? GREEN : RED} label={profit >= 0 ? 'Your profit' : 'Your loss'} value={money(Math.abs(profit))} sub="Money added minus taken out" />
            <BigCard color={GREEN} label="Added today" value={money(data.today.deposits)} sub="Confirmed today" />
            <BigCard color={RED} label="Taken out today" value={money(data.today.withdrawals)} sub="Confirmed today" />
            <BigCard label="First deposit" value={money(data.ftd.amount)} sub={day(data.ftd.date)} />
            <BigCard label="Last deposit" value={money(data.lifetime.lastDepositAmount)} sub={day(data.lifetime.lastDepositAt ?? data.ledger.lastDeposit)} />
            <BigCard label="Last money taken out" value={money(data.lifetime.lastWithdrawalAmount)} sub={day(data.lifetime.lastWithdrawalAt)} />
            <BigCard icon={<Gift size={18} color="#b08d3f" />} label="Bonus given" value={money(data.lifetime.totalBonus)} sub="Total bonus" />
          </div>

          {/* Who this player is, in plain words. */}
          <div className="panel">
            <div className="panel-head">
              <h3>Player details</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 13, padding: '4px 10px', borderRadius: 999 }}>
                  {stageWord(data.customer.currentLifecycle)}
                </span>
                {data.customer.currentCategory ? <Badge variant="secondary">{data.customer.currentCategory}</Badge> : null}
                {data.customer.accountStatus ? <Badge variant="outline">{data.customer.accountStatus}</Badge> : null}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <Field label="Name" value={data.customer.name} />
              <Field label="Player ID" value={data.customer.externalUserId} />
              <Field label="Phone number" value={data.customer.phone} />
              <Field label="Joined on" value={day(data.customer.registrationAt)} />
              <Field label="Stage" value={stageWord(data.customer.currentLifecycle)} />
              <Field label="Group" value={data.customer.currentCategory} />
            </div>
          </div>

          {/* When their stage/group changed over time. */}
          {data.classificationHistory.length ? (
            <div className="panel">
              <div className="panel-head"><h3>Group changes</h3></div>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.classificationHistory.map((e) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                    <span style={{ color: '#94a3b8', minWidth: 110 }}>{day(e.changedAt)}</span>
                    <span style={{ color: '#64748b', textTransform: 'capitalize', minWidth: 70 }}>{e.dimension === 'lifecycle' ? 'Stage' : 'Group'}</span>
                    <span>
                      <span style={{ color: '#94a3b8' }}>{e.dimension === 'lifecycle' ? stageWord(e.oldValue) : (e.oldValue || '—')}</span>
                      <span style={{ margin: '0 8px', color: '#94a3b8' }}>→</span>
                      <b>{e.dimension === 'lifecycle' ? stageWord(e.newValue) : (e.newValue || '—')}</b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Recent live payments (from webhooks / import). */}
          <div className="panel">
            <div className="panel-head">
              <h3>Recent payments</h3>
              <span className="page-sub">Latest {transactionsQuery.data?.total ?? 0} payments</span>
            </div>
            {transactionsQuery.isError ? <div className="banner2">Could not load payments.</div> : null}
            {transactionsQuery.isLoading ? <div className="empty2">Loading payments…</div> : null}
            {transactionsQuery.data && transactionsQuery.data.data.length === 0 ? <div className="empty2">No payments yet.</div> : null}
            {transactionsQuery.data?.data.length ? <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                  <th style={{ padding: 12 }}>When</th><th>Type</th><th>Amount</th><th>Status</th>
                </tr></thead>
                <tbody>{transactionsQuery.data.data.map((t) => {
                  const isIn = t.transactionType === 'DEPOSIT';
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #eef2f7' }}>
                      <td style={{ padding: 12 }}>{day(t.occurredAt)}</td>
                      <td style={{ color: isIn ? GREEN : RED, fontWeight: 600 }}>{isIn ? 'Money in' : 'Money out'}</td>
                      <td style={{ fontWeight: 700 }}>{money(Number(t.amount))}</td>
                      <td><Badge variant={t.isFinanciallySuccessful ? 'default' : 'outline'}>{STATUS_WORDS[t.normalizedStatus] ?? t.normalizedStatus}</Badge></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div> : null}
          </div>
        </> : null}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return <div><div style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>{label}</div><div style={{ fontWeight: 650, fontSize: 15, overflowWrap: 'anywhere' }}>{value || '—'}</div></div>;
}

function BigCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="kpi"><div className="kpi-body">
      <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</div>
      <div className="kpi-value" style={{ color, fontSize: 26 }}>{value}</div>
      <div className="kpi-delta"><span className="kpi-vs">{sub}</span></div>
    </div></div>
  );
}
