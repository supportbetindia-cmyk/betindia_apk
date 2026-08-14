'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';

type Rule = { event: string; template: string; trigger: string };
type LogRow = {
  id: number;
  template: string | null;
  event_type: string | null;
  mobile: string | null;
  user_id: string | null;
  status: string | null;
  detail: string | null;
  created_at: string;
};
type Data = {
  enabled: boolean;
  interaktConfigured: boolean;
  rules: Rule[];
  needsSetup: boolean;
  recent: LogRow[];
};

async function fetchAutomationData(): Promise<Data> {
  const response = await fetch('/api/automations', { cache: 'no-store' });
  const body = await response.json() as Data & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Automation data is temporarily unavailable');
  return body;
}

export default function AutomationsPage() {
  const router = useRouter();
  const automationQuery = useQuery({
    queryKey: ['automations'],
    queryFn: fetchAutomationData,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const data = automationQuery.data;

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const enabled = data?.enabled;
  const interakt = data?.interaktConfigured;
  const queryError = automationQuery.error instanceof Error
    ? automationQuery.error.message
    : null;

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Automations</h1>
            <p className="page-sub">Auto-WhatsApp on deposits &amp; withdrawals ⚡</p>
          </div>
          <div className="topbar-actions">
            <button className="logout-btn2" onClick={logout}>Log out</button>
          </div>
        </header>

        {queryError ? (
          <div className="banner2">Automation data error: {queryError}. Showing the last successful result when available.</div>
        ) : null}

        {/* STATUS */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="kpi" style={{ display: 'block' }}>
            <div className="kpi-label">Automation status</div>
            <div className="kpi-value" style={{ color: enabled ? 'var(--green)' : '#e5484d' }}>
              {enabled ? '● LIVE' : '○ OFF (safe mode)'}
            </div>
            <div className="kpi-delta">
              <span className="kpi-vs">{enabled ? 'sending real messages' : 'logging only — set AUTOMATION_ENABLED=true to go live'}</span>
            </div>
          </div>
          <div className="kpi" style={{ display: 'block' }}>
            <div className="kpi-label">Interakt (WhatsApp)</div>
            <div className="kpi-value" style={{ color: interakt ? 'var(--green)' : '#e5484d' }}>
              {interakt ? '● Connected' : '○ Not configured'}
            </div>
            <div className="kpi-delta"><span className="kpi-vs">{interakt ? 'API key set' : 'add INTERAKT_API_KEY'}</span></div>
          </div>
        </div>

        {/* RULES */}
        <div className="panel">
          <div className="panel-head"><h3>Active Rules</h3><span className="panel-tag">trigger → template</span></div>
          <div className="txn-table">
            <div className="txn-head" style={{ gridTemplateColumns: '1.2fr 1.6fr 0.8fr' }}>
              <span>Trigger event</span><span>WhatsApp template</span><span>Source</span>
            </div>
            {(data?.rules ?? []).map((r) => (
              <div className="txn-row" key={r.template} style={{ gridTemplateColumns: '1.2fr 1.6fr 0.8fr' }}>
                <span>{r.event}</span>
                <span className="txn-mono">{r.template}</span>
                <span className="notif-status s-completed">{r.trigger}</span>
              </div>
            ))}
          </div>
        </div>

        {/* LOG */}
        <div className="panel">
          <div className="panel-head"><h3>Recent Automation Messages</h3><span className="panel-tag live">● live</span></div>
          {data?.needsSetup ? (
            <div className="empty2">Run <code>sql/message_log.sql</code> in Supabase to enable the automation log.</div>
          ) : (data?.recent?.length ?? 0) === 0 ? (
            <div className="empty2">No automation messages yet. They appear here as deposits/withdrawals come in.</div>
          ) : (
            <div className="txn-table">
              <div className="txn-head" style={{ gridTemplateColumns: '1fr 0.8fr 1.4fr 1fr 0.9fr' }}>
                <span>Time</span><span>Type</span><span>Template</span><span>Mobile</span><span>Result</span>
              </div>
              {(data?.recent ?? []).map((l) => (
                <div className="txn-row" key={l.id} style={{ gridTemplateColumns: '1fr 0.8fr 1.4fr 1fr 0.9fr' }}>
                  <span className="txn-mono">{new Date(l.created_at).toLocaleString()}</span>
                  <span className={`txn-type t-${l.event_type === 'withdrawal' ? 'withdrawal' : 'deposit'}`}>{l.event_type ?? '—'}</span>
                  <span className="txn-mono" title={l.detail ?? ''}>{l.template ?? '—'}</span>
                  <span className="txn-mono">{l.mobile ?? '—'}</span>
                  <span className={`notif-status ${l.status === 'sent' ? 's-completed' : l.status === 'failed' ? 's-sent' : 's-scheduled'}`}>
                    {l.status ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="footer-note">
          Setup: run <b>sql/message_log.sql</b> in Supabase, add <b>INTERAKT_API_KEY</b>, set <b>AUTOMATION_ENABLED=true</b> in Hostinger, and call <b>/api/cron/automations</b> every minute with the cron bearer token.
        </div>
      </main>
    </div>
  );
}
