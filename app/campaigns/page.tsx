'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { parseUsersCsv, type ParsedUser } from '@/lib/user-file';

type CampaignLogRow = {
  id: number;
  user_id: string | null;
  mobile: string | null;
  event_type: string | null;
  template: string | null;
  status: string | null;
  detail: string | null;
  last_error: string | null;
  created_at: string;
};

type DaySummary = { date: string; sent: number; failed: number; skipped: number; total: number };

type Counts = {
  users: number;
  active: number;
  lapsed: number;
  neverDeposited: number;
  winbackTargets: number;
  firstDepositTargets: number;
  skippedNoMobile: number;
  skippedCooldown: number;
};
type Preview = { ok: boolean; counts: Counts; totalBonus: number; error?: string };
type SendResult = { ok: boolean; audience: string; eligible: number; attempted: number; sent: number; failed: number; skipped: number; error?: string };

type Audience = 'winback' | 'first_deposit';

export default function CampaignsPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ParsedUser[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [audience, setAudience] = useState<Audience>('winback');
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [logRows, setLogRows] = useState<CampaignLogRow[]>([]);
  const [logFilter, setLogFilter] = useState<'sent' | 'failed' | 'all'>('sent');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<DaySummary[]>([]);

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const loadLog = useCallback(async (status: string, q: string) => {
    try {
      const params = new URLSearchParams({ status });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/reengagement/log?${params.toString()}`, { cache: 'no-store' });
      const body = await res.json() as { ok: boolean; rows: CampaignLogRow[] };
      if (body.ok) setLogRows(body.rows);
    } catch { /* ignore */ }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/reengagement/summary', { cache: 'no-store' });
      const body = await res.json() as { ok: boolean; days: DaySummary[] };
      if (body.ok) setSummary(body.days);
    } catch { /* ignore */ }
  }, []);

  // Debounced: refetch the list when the filter or search changes.
  useEffect(() => {
    const t = setTimeout(() => loadLog(logFilter, search), 350);
    return () => clearTimeout(t);
  }, [logFilter, search, loadLog]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const onFile = useCallback(async (file: File | undefined) => {
    setError(null); setPreview(null); setResult(null);
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseUsersCsv(text);
      setUsers(parsed);
      setFileName(file.name);
      if (parsed.length === 0) setError('No users found in that file — check it has a User_ID column.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const runPreview = useCallback(async () => {
    if (users.length === 0) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/reengagement/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users }),
      });
      const body = await res.json() as Preview;
      if (!res.ok || !body.ok) throw new Error(body.error || 'Preview failed');
      setPreview(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }, [users]);

  const runSend = useCallback(async () => {
    if (!preview) return;
    const target = audience === 'winback' ? preview.counts.winbackTargets : preview.counts.firstDepositTargets;
    const n = Math.min(limit, target);
    if (n <= 0) { setError('No eligible users for this audience right now.'); return; }
    const label = audience === 'winback' ? 'win-back' : 'first-deposit';
    if (!window.confirm(`Send the ${label} WhatsApp to ${n} real user${n === 1 ? '' : 's'} now?\n\nThis sends live messages via the campaign Interakt account.`)) return;

    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/reengagement/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users, audience, limit }),
      });
      const body = await res.json() as SendResult;
      if (!res.ok || !body.ok) throw new Error(body.error || 'Send failed');
      setResult(body);
      await runPreview(); // refresh counts (cooldown now excludes the sent ones)
      await loadLog(logFilter, search); // refresh the sent list
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }, [preview, audience, limit, users, runPreview, loadLog, logFilter, search, loadSummary]);

  // Upload → auto-send BOTH audiences in one click (imports to DB, then sends in bg).
  const runImportAndSend = useCallback(async () => {
    if (users.length === 0) return;
    const wb = preview?.counts.winbackTargets;
    const fd = preview?.counts.firstDepositTargets;
    const detail = (wb != null && fd != null)
      ? `~${wb} win-back + ~${fd} inactive (capped per run)`
      : 'both audiences (capped per run)';
    if (!window.confirm(`Import ${users.length.toLocaleString()} users and AUTO-SEND to ${detail}?\n\nThis sends live WhatsApp in the background.`)) return;

    setBusy(true); setError(null); setResult(null); setAutoMsg(null);
    try {
      const res = await fetch('/api/reengagement/import-and-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users }),
      });
      const body = await res.json() as { ok: boolean; imported?: number; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to start');
      setAutoMsg(`Imported ${body.imported ?? users.length} users. Sending win-back + inactive in the background — watch "Sent Notifications" below.`);
      setTimeout(() => { loadLog(logFilter, search); loadSummary(); }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }, [users, preview, loadLog, logFilter, search, loadSummary]);

  const c = preview?.counts;

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Campaigns</h1>
            <p className="page-sub">Win-back &amp; first-deposit WhatsApp from your user list 📣</p>
          </div>
          <div className="topbar-actions">
            <button className="logout-btn2" onClick={logout}>Log out</button>
          </div>
        </header>

        {error ? <div className="banner2" style={{ borderColor: '#e5484d', color: '#e5484d' }}>{error}</div> : null}

        {/* STEP 1 — upload */}
        <div className="panel">
          <div className="panel-head"><h3>1. Upload user list (CSV)</h3><span className="panel-tag">from Excel → Save As CSV</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 2px', flexWrap: 'wrap' }}>
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            {fileName ? <span className="kpi-vs">{fileName} — <b>{users.length.toLocaleString()}</b> users loaded</span> : <span className="kpi-vs">No file chosen</span>}
            <button className="txn-filter active" disabled={busy || users.length === 0} onClick={runPreview} style={{ marginLeft: 'auto' }}>
              {busy ? 'Working…' : 'Preview audiences'}
            </button>
            <button className="logout-btn2" style={{ background: 'var(--green, #16a34a)', color: '#fff' }} disabled={busy || users.length === 0} onClick={runImportAndSend}>
              {busy ? 'Working…' : 'Import & Auto-Send both →'}
            </button>
          </div>
          {autoMsg ? <div className="footer-note" style={{ color: 'var(--green, #16a34a)' }}>{autoMsg}</div> : null}
        </div>

        {/* STEP 2 — audience breakdown */}
        {c ? (
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <Mini label="Total users" value={c.users.toLocaleString()} sub="in this file" color="#4f46e5" />
            <Mini label="Active" value={c.active.toLocaleString()} sub="played < 7 days" color="#059669" />
            <Mini label="Win-back targets" value={c.winbackTargets.toLocaleString()} sub="lapsed 7–90 days" color="#2563eb" />
            <Mini label="First-deposit targets" value={c.firstDepositTargets.toLocaleString()} sub="never deposited" color="#ca8a04" />
            <Mini label="Skipped (cooldown)" value={c.skippedCooldown.toLocaleString()} sub="messaged recently" color="#7c3aed" />
            <Mini label="Skipped (no mobile)" value={c.skippedNoMobile.toLocaleString()} sub="unreachable" color="#dc2626" />
          </div>
        ) : null}

        {/* STEP 3 — send */}
        {c ? (
          <div className="panel">
            <div className="panel-head"><h3>2. Send a batch</h3><span className="panel-tag">live WhatsApp</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '6px 2px', flexWrap: 'wrap' }}>
              <div className="txn-filters">
                {(['winback', 'first_deposit'] as const).map((a) => (
                  <button key={a} className={`txn-filter${audience === a ? ' active' : ''}`} onClick={() => setAudience(a)}>
                    {a === 'winback' ? `Win-back (${c.winbackTargets})` : `First-deposit (${c.firstDepositTargets})`}
                  </button>
                ))}
              </div>
              <label className="kpi-vs" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Batch size
                <input type="number" min={1} max={200} value={limit}
                  onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                  style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(13,18,41,.15)' }} />
              </label>
              <button className="logout-btn2" style={{ background: 'var(--green, #16a34a)', color: '#fff', marginLeft: 'auto' }}
                disabled={busy} onClick={runSend}>
                {busy ? 'Sending…' : `Send ${audience === 'winback' ? 'win-back' : 'first-deposit'} →`}
              </button>
            </div>
            <div className="footer-note" style={{ marginTop: 4 }}>
              Max 200 per click (use the CLI for large blasts). Already-messaged users are auto-skipped. Marketing messages may be capped by WhatsApp (error 131049) — re-run tomorrow to retry the ones that failed.
            </div>
          </div>
        ) : null}

        {/* RESULT */}
        {result ? (
          <div className="panel">
            <div className="panel-head"><h3>Last send result</h3><span className="panel-tag live">● done</span></div>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <Mini label="Sent" value={String(result.sent)} sub="delivered to Interakt" color="#059669" />
              <Mini label="Failed" value={String(result.failed)} sub="mostly WhatsApp caps" color="#dc2626" />
              <Mini label="Skipped" value={String(result.skipped)} sub="already messaged" color="#7c3aed" />
              <Mini label="Attempted" value={String(result.attempted)} sub={`of ${result.eligible} eligible`} color="#4f46e5" />
            </div>
          </div>
        ) : null}

        {/* DAILY SUMMARY */}
        {summary.length > 0 ? (
          <div className="panel">
            <div className="panel-head"><h3>Daily Summary</h3><span className="panel-tag">last 14 days</span></div>
            <div className="txn-table">
              <div className="txn-head" style={{ gridTemplateColumns: '1fr 0.7fr 0.7fr 0.7fr 0.7fr' }}>
                <span>Date</span><span>Sent</span><span>Failed</span><span>Skipped</span><span>Total</span>
              </div>
              {summary.map((d) => (
                <div className="txn-row" key={d.date} style={{ gridTemplateColumns: '1fr 0.7fr 0.7fr 0.7fr 0.7fr' }}>
                  <span className="txn-mono">{d.date}</span>
                  <span style={{ color: 'var(--green, #16a34a)' }}>{d.sent}</span>
                  <span style={{ color: '#dc2626' }}>{d.failed}</span>
                  <span style={{ color: '#7c3aed' }}>{d.skipped}</span>
                  <span>{d.total}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* SENT LIST — which user got which notification */}
        <div className="panel">
          <div className="panel-head">
            <h3>Sent Notifications</h3>
            <div className="txn-toolbar">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search User ID or mobile"
                aria-label="Search notifications"
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(13,18,41,.15)' }}
              />
              <div className="txn-filters">
                {(['sent', 'failed', 'all'] as const).map((f) => (
                  <button key={f} className={`txn-filter${logFilter === f ? ' active' : ''}`} onClick={() => setLogFilter(f)}>{f}</button>
                ))}
              </div>
            </div>
          </div>
          {logRows.length === 0 ? (
            <div className="empty2">No campaign messages yet. They appear here as you send.</div>
          ) : (
            <div className="txn-table">
              <div className="txn-head" style={{ gridTemplateColumns: '1.1fr 1.2fr 1fr 0.9fr 0.8fr' }}>
                <span>Time</span><span>User ID</span><span>Mobile</span><span>Campaign</span><span>Status</span>
              </div>
              {logRows.map((l) => (
                <div className="txn-row" key={l.id} style={{ gridTemplateColumns: '1.1fr 1.2fr 1fr 0.9fr 0.8fr' }}>
                  <span className="txn-mono">{new Date(l.created_at).toLocaleString()}</span>
                  <span className="txn-mono" title={l.user_id ?? ''}>{l.user_id ?? '—'}</span>
                  <span className="txn-mono">{l.mobile ?? '—'}</span>
                  <span>{l.event_type === 'first_deposit' ? 'first-deposit' : 'win-back'}</span>
                  <span
                    className={`notif-status ${l.status === 'sent' ? 's-completed' : l.status === 'failed' ? 's-failed' : 's-scheduled'}`}
                    title={l.last_error ?? l.detail ?? ''}
                  >
                    {l.status ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Mini({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="kpi" style={{ display: 'block', ['--accent' as string]: color }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-delta"><span className="kpi-vs">{sub}</span></div>
    </div>
  );
}
