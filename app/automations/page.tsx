'use client';
import { logout } from '@/lib/logout';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { backendRequest } from '@/lib/backend-api';

type Rule = { event: string; template: string; trigger: string };
type Toggles = {
  enabled: boolean;
  deposit: boolean;
  withdrawal: boolean;
  winback: boolean;
  statement: boolean;
  campaigns: boolean;
};
type Health = {
  queued: number;
  failed: number;
  oldestQueuedAgeMin: number | null;
  lastCronRun: string | null;
  cronAgeMin: number | null;
  warning: string | null;
};
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
  health?: Health;
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

// The lifecycle engine's per-stage WhatsApp. On/off is the retention WhatsApp
// account's "On" switch; this panel shows reach per stage + a manual run.
const STAGE_LABELS: Record<string, string> = {
  LEAD: 'Leads (not registered)',
  REGISTERED_NO_FTD: 'Registered · no deposit',
  FTD: 'Just made first deposit',
  FTD_NO_REPEAT: 'First deposit · no repeat',
  ACTIVE: 'Active players',
  INACTIVE: 'Inactive',
  REACTIVATED: 'Just came back',
};
type StagePreview = { stage: string; template: string | null; eligible: number };
type LifecyclePreview = { configured: boolean; stages: StagePreview[] };
type LifecycleRun = { configured: boolean; results: { stage: string; sent: number; failed: number }[] };

// Plain one-liners so anyone reading the table knows what each stage is.
const STAGE_DESC: Record<string, string> = {
  LEAD: 'Signed up but no account yet — nudge to get started',
  REGISTERED_NO_FTD: 'Account made, never deposited — nudge for first deposit',
  FTD: 'Just made their first deposit — welcome them',
  FTD_NO_REPEAT: 'Deposited once, not again yet — check in',
  ACTIVE: 'Playing regularly — left alone (no message)',
  INACTIVE: 'Gone quiet — win-back nudge',
  REACTIVATED: 'Came back after being away — welcome back',
};

function LifecyclePanel() {
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ['lifecycle-preview'],
    queryFn: ({ signal }) => backendRequest<LifecyclePreview>('/lifecycle/send/preview', { signal }),
    refetchInterval: 30_000,
  });
  const run = useMutation({
    mutationFn: () => backendRequest<LifecycleRun>('/lifecycle/send/run', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lifecycle-preview'] }),
  });
  const data = preview.data;
  const configured = data?.configured;
  const totalReady = data?.stages.reduce((s, x) => s + (x.template ? x.eligible : 0), 0) ?? 0;
  const result = run.data;
  const sent = result?.results.reduce((s, r) => s + r.sent, 0) ?? 0;
  const failed = result?.results.reduce((s, r) => s + r.failed, 0) ?? 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Automatic WhatsApp messages</h3>
          <div className="page-sub" style={{ margin: '4px 0 0' }}>Each player gets the right message for where they are in their journey.</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: configured ? '#ecfdf3' : '#fff7ed', color: configured ? '#15803d' : '#b45309' }}>
          {configured ? 'Turned on' : 'Turned off'}
        </span>
      </div>

      {configured ? (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', borderRadius: 10, background: '#f6f9fc', border: '1px solid var(--border)', marginBottom: 14 }}>
          <div><span style={{ fontSize: 22, fontWeight: 700, color: '#1a1f36' }}>{totalReady.toLocaleString()}</span> <span className="page-sub" style={{ margin: 0 }}>players ready for their next message</span></div>
          <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
          <div className="page-sub" style={{ margin: 0 }}>Sends up to <b>200</b> per run · no one messaged twice within <b>7 days</b></div>
        </div>
      ) : (
        <div className="banner2" style={{ marginBottom: 14 }}>Not set up yet — add a retention WhatsApp account (with a key) and switch it on.</div>
      )}

      <div className="txn-table">
        <div className="txn-head" style={{ gridTemplateColumns: '2fr 1.3fr 0.6fr' }}>
          <span>Player stage</span><span>Message sent</span><span className="num">Waiting</span>
        </div>
        {(data?.stages ?? []).map((s) => (
          <div className="txn-row" key={s.stage} style={{ gridTemplateColumns: '2fr 1.3fr 0.6fr', alignItems: 'flex-start' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <b style={{ fontWeight: 600, color: '#1a1f36' }}>{STAGE_LABELS[s.stage] ?? s.stage}</b>
              <small className="page-sub" style={{ margin: 0, fontSize: 11 }}>{STAGE_DESC[s.stage] ?? ''}</small>
            </span>
            <span className="txn-mono" style={{ paddingTop: 2 }}>{s.template ?? <span className="muted">— none —</span>}</span>
            <span className="num" style={{ fontWeight: 700, paddingTop: 2 }}>{s.template ? s.eligible.toLocaleString() : '—'}</span>
          </div>
        ))}
      </div>

      <p className="page-sub" style={{ fontSize: 11, margin: '10px 2px 0' }}>
        &ldquo;Waiting&rdquo; counts only players with a phone number who are due a message, and shows at most 200 (the per-run limit). The rest are sent on the next runs.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <Button
          disabled={!configured || run.isPending}
          onClick={() => { if (window.confirm('Send WhatsApp now to all players who are due one?\n\nRespects the 7-day cooldown and the 200-per-run limit.')) run.mutate(); }}
        >
          {run.isPending ? 'Sending…' : 'Send now'}
        </Button>
        {run.error ? <span style={{ color: '#b91c1c', fontSize: 13 }}>{run.error instanceof Error ? run.error.message : 'Failed'}</span> : null}
        {result ? <span style={{ color: '#15803d', fontSize: 13, fontWeight: 600 }}>Done — sent {sent}, failed {failed}.</span> : null}
      </div>
    </div>
  );
}

type LifecycleConfig = { inactiveDays: number; ftdNoRepeatDays: number; cooldownDays: number; maxFollowups: number };
const CONFIG_FIELDS: { key: keyof LifecycleConfig; label: string; hint: string }[] = [
  { key: 'inactiveDays', label: 'Inactive after (days)', hint: 'No deposit/withdrawal this long → Inactive' },
  { key: 'ftdNoRepeatDays', label: 'First-deposit no-repeat (days)', hint: 'One deposit, no repeat within this' },
  { key: 'cooldownDays', label: 'Message cooldown (days)', hint: 'Don’t message the same player again within this' },
  { key: 'maxFollowups', label: 'Max messages per stage', hint: 'Stop after this many, until they move stage' },
];

// Editable per-company lifecycle thresholds (the numbers the stage engine + sender use).
function LifecycleConfigForm() {
  const qc = useQueryClient();
  const cfgQuery = useQuery({ queryKey: ['lifecycle-config'], queryFn: ({ signal }) => backendRequest<LifecycleConfig>('/lifecycle/config', { signal }) });
  const [draft, setDraft] = useState<LifecycleConfig | null>(null);
  useEffect(() => { if (cfgQuery.data) setDraft(cfgQuery.data); }, [cfgQuery.data]);
  const save = useMutation({
    mutationFn: (body: LifecycleConfig) => backendRequest<LifecycleConfig>('/lifecycle/config', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (d) => { setDraft(d); qc.invalidateQueries({ queryKey: ['lifecycle-preview'] }); },
  });
  if (!draft) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Timing &amp; limits</h3>
          <div className="page-sub" style={{ margin: '4px 0 0' }}>The rules that decide when a player changes stage and how often they&apos;re messaged.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, padding: '4px 2px' }}>
        {CONFIG_FIELDS.map((f) => (
          <label key={f.key} style={{ fontSize: 13, color: '#1a1f36', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span>{f.label}</span>
            <input type="number" min={1} value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: Math.max(1, Number(e.target.value) || 1) })}
              style={{ width: '100%', height: 38, borderRadius: 9, border: '1px solid var(--border)', padding: '0 11px', fontWeight: 600 }} />
            <span className="page-sub" style={{ margin: 0, fontSize: 11, fontWeight: 400 }}>{f.hint}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        {save.isSuccess ? <span style={{ color: '#15803d', fontSize: 13, fontWeight: 600 }}>Saved — takes effect within ~2 minutes.</span> : null}
        {save.error ? <span style={{ color: '#b91c1c', fontSize: 13 }}>{save.error instanceof Error ? save.error.message : 'Failed'}</span> : null}
      </div>
    </div>
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
    await logout();
    router.refresh();
  }, [router]);

  const enabled = data?.enabled;
  const interakt = data?.interaktConfigured;
  const tog: Toggles = data?.toggles ?? { enabled: Boolean(enabled), deposit: true, withdrawal: true, winback: true, statement: true, campaigns: false };
  const health = data?.health;
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
        {health?.warning ? (
          <div className="banner2" style={{ borderColor: '#e5484d', color: '#e5484d' }}>
            ⚠ {health.warning}
          </div>
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
            <div className="kpi-label">WhatsApp connection</div>
            <div className="kpi-value" style={{ color: interakt ? 'var(--green)' : '#e5484d' }}>
              {interakt ? '● Connected' : '○ Not connected'}
            </div>
            <div className="kpi-delta"><span className="kpi-vs">{interakt ? 'Connected and ready' : 'Not connected yet'}</span></div>
          </div>
        </div>

        {/* QUEUE HEALTH */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="kpi" style={{ display: 'block' }}>
            <div className="kpi-label">Waiting to send</div>
            <div className="kpi-value" style={{ color: (health?.queued ?? 0) > 0 ? '#ca8a04' : 'var(--green)' }}>{health?.queued ?? 0}</div>
            <div className="kpi-delta"><span className="kpi-vs">{(health?.queued ?? 0) > 0 ? `oldest ${health?.oldestQueuedAgeMin ?? 0} min` : 'queue empty'}</span></div>
          </div>
          <div className="kpi" style={{ display: 'block' }}>
            <div className="kpi-label">Failed</div>
            <div className="kpi-value" style={{ color: (health?.failed ?? 0) > 0 ? '#e5484d' : 'var(--green)' }}>{health?.failed ?? 0}</div>
            <div className="kpi-delta"><span className="kpi-vs">after all retries</span></div>
          </div>
          <div className="kpi" style={{ display: 'block' }}>
            <div className="kpi-label">Last send check</div>
            <div className="kpi-value" style={{ fontSize: 18 }}>{health?.lastCronRun ? new Date(health.lastCronRun).toLocaleTimeString() : '—'}</div>
            <div className="kpi-delta"><span className="kpi-vs">{health?.lastCronRun ? `${health?.cronAgeMin ?? 0} min ago` : 'not run yet'}</span></div>
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

        {/* OTHER AUTOMATIONS */}
        <div className="panel">
          <div className="panel-head">
            <h3>Other Automations</h3>
            <span className="panel-tag">push &amp; sync</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '6px 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Win-back push (daily)</div>
                <div className="kpi-vs">Push notification to players who haven&apos;t opened the app in a while</div>
              </div>
              <ToggleSwitch
                on={tog.winback}
                disabled={busy}
                label="Win-back push switch"
                onChange={(value) => toggleMutation.mutate({ key: 'winback_enabled', value })}
              />
            </div>
            <div style={{ height: 1, background: 'rgba(13,18,41,.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Statement sync (every 5 min)</div>
                <div className="kpi-vs">Reconcile withdrawals/deposits against the wallet statement for accurate totals</div>
              </div>
              <ToggleSwitch
                on={tog.statement}
                disabled={busy}
                label="Statement sync switch"
                onChange={(value) => toggleMutation.mutate({ key: 'statement_enabled', value })}
              />
            </div>
            <div style={{ height: 1, background: 'rgba(13,18,41,.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Re-engagement campaigns (daily)</div>
                <div className="kpi-vs" style={{ color: tog.campaigns ? 'var(--green)' : '#e5484d' }}>
                  {tog.campaigns ? 'ON — daily win-back & first-deposit WhatsApp will auto-send' : 'OFF — no campaigns auto-send'}
                </div>
              </div>
              <ToggleSwitch
                on={tog.campaigns}
                disabled={busy}
                label="Re-engagement campaigns switch"
                onChange={(value) => {
                  if (value && !window.confirm('Turn ON daily auto-campaigns?\n\nEach day this will send win-back + first-deposit WhatsApp to eligible users (capped). Make sure the campaign template + key are set.')) return;
                  toggleMutation.mutate({ key: 'campaigns_enabled', value });
                }}
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

        {/* WIN-BACK */}
        <LifecyclePanel />
        <LifecycleConfigForm />

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
          Use the <b>Control Panel</b> switches to turn messages on or off instantly. The <b>master switch</b> pauses everything at once —
          handy if you ever need to stop all WhatsApp sending immediately.
        </div>
      </main>
    </div>
  );
}
