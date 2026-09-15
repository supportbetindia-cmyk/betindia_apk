'use client';

import { useQuery } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';

type UserTxn = {
  id: number;
  type: 'deposit' | 'withdrawal';
  transaction_id: string | null;
  amount: number | null;
  payment_status: string | null;
  remarks: string | null;
  created_at: string;
  status: 'approved' | 'rejected' | 'pending';
};

const money = (n: number | null) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS_CLASS: Record<UserTxn['status'], string> = { approved: 's-completed', rejected: 's-failed', pending: 's-scheduled' };

async function fetchUser(userId: string): Promise<UserTxn[]> {
  const res = await fetch(`/api/user-analytics/user?userId=${encodeURIComponent(userId)}`);
  const body = (await res.json()) as { transactions?: UserTxn[]; error?: string };
  if (!res.ok) throw new Error(body.error || 'Failed to load user');
  return body.transactions ?? [];
}

export function UserDetail({ userId, name, mobile, onClose }: {
  userId: string; name: string | null; mobile: string | null; onClose: () => void;
}) {
  const query = useQuery({ queryKey: ['user-detail', userId], queryFn: () => fetchUser(userId) });
  const txns = query.data ?? [];

  const approvedDep = txns.filter((t) => t.type === 'deposit' && t.status === 'approved');
  const approvedWd = txns.filter((t) => t.type === 'withdrawal' && t.status === 'approved');
  const sum = (rows: UserTxn[]) => rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const pnl = sum(approvedDep) - sum(approvedWd);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{name || userId}</div>
            <div className="modal-sub">{mobile ? `${mobile} · ` : ''}ID {userId}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          <MiniStat label="Deposits" value={money(sum(approvedDep))} sub={`${approvedDep.length} approved`} />
          <MiniStat label="Withdrawals" value={money(sum(approvedWd))} sub={`${approvedWd.length} approved`} />
          <MiniStat label="P/L" value={money(pnl)} sub="deposits − withdrawals" tone={pnl >= 0 ? 'pos' : 'neg'} />
          <MiniStat label="Transactions" value={String(txns.length)} sub="all records" />
        </div>

        {query.isLoading ? (
          <div className="empty2"><Loader2 size={18} className="spin" /> Loading transactions…</div>
        ) : query.isError ? (
          <div className="banner2">{(query.error as Error).message}</div>
        ) : txns.length ? (
          <div className="ua-table modal-txns">
            <div className="ua-head" style={{ gridTemplateColumns: '0.8fr 0.9fr 0.9fr 1.4fr 1.2fr' }}>
              <span>Type</span><span>Amount</span><span>Status</span><span>Remark</span><span>When</span>
            </div>
            {txns.map((t) => (
              <div className="ua-row" key={t.id} style={{ gridTemplateColumns: '0.8fr 0.9fr 0.9fr 1.4fr 1.2fr' }}>
                <span className={`txn-type t-${t.type}`}>{t.type}</span>
                <span className="txn-amt">{money(t.amount)}</span>
                <span className={`notif-status ${STATUS_CLASS[t.status]}`}>{t.status}</span>
                <span className="ua-remark" title={t.remarks ?? ''}>{t.remarks ?? '—'}</span>
                <span className="txn-mono">{when(t.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty2">No transactions on record for this user.</div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="kpi" style={{ display: 'block' }}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone === 'pos' ? 'ua-pos' : tone === 'neg' ? 'ua-neg' : ''}`}>{value}</div>
      <div className="kpi-delta"><span className="kpi-vs">{sub}</span></div>
    </div>
  );
}
