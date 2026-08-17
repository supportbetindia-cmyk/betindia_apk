'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';

type Rule = { event: string; template: string; trigger: string };
type Toggles = { enabled: boolean; deposit: boolean; withdrawal: boolean };
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
  toggles?: Toggles;
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

function ToggleSwitch({ on, onChange, disabled, label }: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 54,
        height: 30,
        borderRadius: 999,
        background: on ? 'var(--green, #16a34a)' : '#c3cad8',
        border: 'none',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background .2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 27 : 3,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s',
          boxShadow: '0 1px 3px rgba(0,0,0,.35)',
        }}
      />
    </button>
  );
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

  const toggleMutation = useMutation({
    mutationFn: async (vars: { key: string; value: boolean }) => {
      const response = await fetch('/api/automations/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not update the switch');
      return body;
    },
    onSuccess: () => automationQuery.refetch(),
  });

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const enabled = data?.enabled;
  const interakt = data?.interaktConfigured;
  const tog: Toggles = data?.toggles ?? { enabled: Boolean(enabled), deposit: true, withdrawal: true };
  const busy = toggleMutation.isPending;
  const queryError = automationQuery.error instanceof Error
    ? automationQuery.error.message
    : null;
  const toggleError = toggleMutation.error instanceof Error ? toggleMutation.error.message : null;

  const toggleMaster = (next: boolean) => {
    if (!next && !window.confirm('Turn OFF all WhatsApp automation?\n\nNo deposit or withdrawal messages will be sent until you turn it back on.')) {
      return;
    }
    toggleMutation.mutate({ key: 'automation_enabled', value: next });
  };

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
        {toggleError ? (
          <div className="banner2">Could not save the switch: {toggleError}. Try again.</div>
        ) : null}

        {/* STATUS */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="kpi" style={{ display: 'block' }}>
            <div className="kpi-label">Automation status</div>
            <div className="kpi-value" style={{ color: enabled ? 'var(--green)' : '#e5484d' }}>
              {enabled ? '● LIVE' : '○ OFF (paused)'}
            </div>
            <div className="kpi-delta">
              <span className="kpi-vs">{enabled ? 'sending real messages' : 'paused — no messages are being sent'}</span>
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

        {/* CONTROL PANEL */}
        <div className="panel">
          <div className="panel-head">
            <h3>Control Panel</h3>
            <span className="panel-tag">turn automation on / off</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '6px 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Master switch — all WhatsApp automation</div>
                <div className="kpi-vs" style={{ color: tog.enabled ? 'var(--green)' : '#e5484d' }}>
                  {tog.enabled ? 'ON — messages are being sent' : 'OFF — nothing will be sent'}
                </div>
              </div>
              <ToggleSwitch on={tog.enabled} disabled={busy} label="Master automation switch" onChange={toggleMaster} />
            </div>

            <div style={{ height: 1, background: 'rgba(13,18,41,.1)' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, opacity: tog.enabled ? 1 : 0.5 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Deposit messages</div>
                <div className="kpi-vs">Send a WhatsApp when a deposit comes in</div>
              </div>
              <ToggleSwitch
                on={tog.deposit}
                disabled={busy || !tog.enabled}
                label="Deposit messages switch"
                onChange={(value) => toggleMutation.mutate({ key: 'automation_deposit', value })}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, opacity: tog.enabled ? 1 : 0.5 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Withdrawal messages</div>
                <div className="kpi-vs">Send a WhatsApp when a withdrawal comes in</div>
              </div>
              <ToggleSwitch
                on={tog.withdrawal}
                disabled={busy || !tog.enabled}
                label="Withdrawal messages switch"
                onChange={(value) => toggleMutation.mutate({ key: 'automation_withdrawal', value })}
              />
            </div>
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
          Use the <b>Control Panel</b> switches above to turn automation on or off instantly — no redeploy needed.
          A per-minute cron drains the queue and sends each WhatsApp; the master switch pauses all sending at once.
        </div>
      </main>
    </div>
  );
}
