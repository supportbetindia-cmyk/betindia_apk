'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, RefreshCw } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useMasterFilter } from '@/components/MasterFilterProvider';
import { Button } from '@/components/ui/button';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { backendRequest } from '@/lib/backend-api';

type Alert = {
  id: string; type: string; severity: string; title: string; body: string | null;
  entity_id: string | null; value: string | null; acknowledged: boolean; created_at: string;
};

const SEV: Record<string, { color: string; bg: string; label: string }> = {
  high: { color: '#b91c1c', bg: '#fef2f2', label: 'High' },
  medium: { color: '#b45309', bg: '#fff7ed', label: 'Medium' },
  low: { color: '#475569', bg: '#f1f5f9', label: 'Low' },
};
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AlertsPage() {
  const { tenantId, scopedHref } = useMasterFilter();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['alerts', tenantId],
    queryFn: ({ signal }) => backendRequest<Alert[]>('/alerts', { tenantId, signal }),
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
  });
  const check = useMutation({
    mutationFn: () => backendRequest<{ created: number }>('/alerts/run', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', tenantId] }),
  });
  const ack = useMutation({
    mutationFn: (id: string) => backendRequest(`/alerts/${id}/ack`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', tenantId] }),
  });
  useAuthRedirect(query.error);

  const alerts = query.data ?? [];
  const open = alerts.filter((a) => !a.acknowledged);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Alerts</h1>
            <p className="page-sub">Things worth acting on — VIPs going quiet, big withdrawals, first deposits dropping.</p>
          </div>
          <Button variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
            <RefreshCw size={15} style={{ marginRight: 6 }} />{check.isPending ? 'Checking…' : 'Check now'}
          </Button>
        </header>

        {!tenantId ? <div className="banner2">Select a company first.</div> : null}
        {check.data ? <div className="banner2 banner-ok">Checked — {check.data.created} new alert{check.data.created === 1 ? '' : 's'}.</div> : null}

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Open alerts</h3>
              <div className="page-sub" style={{ margin: '4px 0 0' }}>{open.length} need{open.length === 1 ? 's' : ''} attention</div>
            </div>
          </div>

          {query.isLoading ? (
            <div className="skeleton-list">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton skeleton-row" />)}</div>
          ) : alerts.length === 0 ? (
            <div className="empty2"><Bell size={22} /><div>No alerts. You&apos;re all clear — click &ldquo;Check now&rdquo; to run the checks.</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map((a) => {
                const s = SEV[a.severity] ?? SEV.low;
                return (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12,
                    border: '1px solid var(--border)', background: a.acknowledged ? '#fafbfd' : '#fff',
                    opacity: a.acknowledged ? 0.6 : 1, boxShadow: a.acknowledged ? 'none' : 'var(--shadow)',
                  }}>
                    <span style={{ marginTop: 3, width: 9, height: 9, borderRadius: '50%', background: s.color, flex: '0 0 auto' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 14, color: '#1a1f36' }}>{a.title}</b>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color }}>{s.label}</span>
                        <span className="page-sub" style={{ margin: 0, fontSize: 11 }}>{when(a.created_at)}</span>
                      </div>
                      <div className="page-sub" style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>{a.body}</div>
                      {a.entity_id ? <Link href={scopedHref(`/customers/${a.entity_id}`)} style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 600 }}>View player →</Link> : null}
                    </div>
                    {!a.acknowledged ? (
                      <button className="btn-ghost" onClick={() => ack.mutate(a.id)} disabled={ack.isPending} style={{ flex: '0 0 auto' }}>
                        <Check size={14} style={{ marginRight: 5 }} />Dismiss
                      </button>
                    ) : <span className="page-sub" style={{ margin: 0, fontSize: 11 }}>Dismissed</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
