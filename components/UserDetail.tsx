'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMasterFilter } from './MasterFilterProvider';
import { withMaster } from '@/lib/master-filter';

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
const STATUS_VARIANT: Record<UserTxn['status'], 'default' | 'destructive' | 'muted'> = {
  approved: 'default', rejected: 'destructive', pending: 'muted',
};

async function fetchUser(userId: string, masterId: string): Promise<UserTxn[]> {
  const res = await fetch(withMaster(`/api/user-analytics/user?userId=${encodeURIComponent(userId)}`, masterId));
  const body = (await res.json()) as { transactions?: UserTxn[]; error?: string };
  if (!res.ok) throw new Error(body.error || 'Failed to load user');
  return body.transactions ?? [];
}

export function UserDetail({ userId, name, mobile, onClose }: {
  userId: string; name: string | null; mobile: string | null; onClose: () => void;
}) {
  const { masterId } = useMasterFilter();
  const query = useQuery({ queryKey: ['user-detail', userId, masterId], queryFn: () => fetchUser(userId, masterId) });
  const txns = query.data ?? [];

  const approvedDep = txns.filter((t) => t.type === 'deposit' && t.status === 'approved');
  const approvedWd = txns.filter((t) => t.type === 'withdrawal' && t.status === 'approved');
  const sum = (rows: UserTxn[]) => rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const pnl = sum(approvedDep) - sum(approvedWd);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name && name !== '0' ? name : userId}</DialogTitle>
          <DialogDescription className="font-mono">{mobile ? `${mobile} · ` : ''}ID {userId}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Deposits" value={money(sum(approvedDep))} sub={`${approvedDep.length} approved`} />
          <Stat label="Withdrawals" value={money(sum(approvedWd))} sub={`${approvedWd.length} approved`} />
          <Stat label="P/L" value={money(pnl)} sub="dep − wd" tone={pnl >= 0 ? 'pos' : 'neg'} />
          <Stat label="Transactions" value={String(txns.length)} sub="all records" />
        </div>

        {query.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading transactions…</div>
        ) : query.isError ? (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{(query.error as Error).message}</div>
        ) : txns.length ? (
          <div className="max-h-[46vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Remark</th>
                  <th className="px-3 py-2 text-left font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2 capitalize">{t.type}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(t.amount)}</td>
                    <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[t.status]} className="capitalize">{t.status}</Badge></td>
                    <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground" title={t.remarks ?? ''}>{t.remarks ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-muted-foreground">{when(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">No transactions on record for this user.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-lg font-bold tabular-nums', tone === 'pos' && 'text-primary', tone === 'neg' && 'text-destructive')}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
