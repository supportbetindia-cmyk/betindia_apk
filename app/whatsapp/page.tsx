'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { LogOut } from 'lucide-react';

type SegUser = { key: string; userName: string | null; mobile: string | null; depositTotal: number; depositCount: number };
type Segment = { key: string; label: string; count: number; users: SegUser[] };

export default function WhatsAppPage() {
  const router = useRouter();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segError, setSegError] = useState<string | null>(null);

  const [templateName, setTemplateName] = useState('');
  const [languageCode, setLanguageCode] = useState('en');
  const [bodyValues, setBodyValues] = useState('');
  const [target, setTarget] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const loadSegments = useCallback(async () => {
    try {
      const res = await fetch('/api/segments', { cache: 'no-store' });
      const body = await res.json();
      if (body.error) setSegError(body.error);
      setSegments(body.segments ?? []);
    } catch (e) {
      setSegError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const selected = segments.find((s) => s.key === target);
  const canSend = templateName.trim() && selected && selected.count > 0;

  async function doSend() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName,
          languageCode,
          bodyValues: bodyValues ? bodyValues.split('|').map((v) => v.trim()) : [],
          segment: target,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setResult({ ok: true, text: `Sent ${body.sent}, failed ${body.failed} (of ${body.total}).` });
      } else {
        setResult({ ok: false, text: body.error || 'Send failed' });
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">WhatsApp CRM</h1>
            <p className="page-sub">Build customer segments and manage WhatsApp campaigns</p>
          </div>
          <div className="topbar-actions">
            <button className="logout-btn2" onClick={logout}><LogOut size={15} /><span>Log out</span></button>
          </div>
        </header>

        {/* SEGMENTS */}
        <div className="panel">
          <div className="panel-head"><h3>Customer Segments</h3><span className="panel-tag">from transactions</span></div>
          {segError ? (
            <div className="panel-note">
              Segments need transaction data. Run the WATI webhook, and these populate automatically. ({segError})
            </div>
          ) : null}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {segments.map((s) => (
              <div className="kpi" key={s.key} style={{ display: 'block' }}>
                <div className="kpi-label">{s.label}</div>
                <div className="kpi-value">{s.count}</div>
                <div className="kpi-delta"><span className="kpi-vs">users</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* COMPOSER */}
        <div className="panel">
          <div className="panel-head"><h3>Send WhatsApp Campaign</h3><span className="panel-tag">Interakt · Template</span></div>
          <div className="composer">
            <div className="cmp-row">
              <label className="cmp-label">
                Approved template name
                <input className="cmp-input" placeholder="e.g. welcome_message" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              </label>
              <label className="cmp-label">
                Language
                <input className="cmp-input" value={languageCode} onChange={(e) => setLanguageCode(e.target.value)} />
              </label>
            </div>

            <label className="cmp-label">
              Body values (fill template {'{{1}}'}, {'{{2}}'}… — separate with <b>|</b>, use {'{{name}}'} for the user&apos;s name)
              <input className="cmp-input" placeholder="{{name}}|₹500 bonus" value={bodyValues} onChange={(e) => setBodyValues(e.target.value)} />
            </label>

            <label className="cmp-label">
              Send to segment
              <select className="cmp-select" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">— choose a segment —</option>
                {segments.map((s) => (
                  <option key={s.key} value={s.key} disabled={s.count === 0}>
                    {s.label} ({s.count})
                  </option>
                ))}
              </select>
            </label>

            {result ? <div className={result.ok ? 'cmp-ok' : 'cmp-err'}>{result.text}</div> : null}

            {!confirming ? (
              <button className="cmp-btn" disabled={!canSend || sending} onClick={() => setConfirming(true)}>
                Review &amp; Send
              </button>
            ) : (
              <div className="cmp-confirm">
                <span>
                  Send template “<b>{templateName}</b>” to <b>{selected?.label}</b> ({selected?.count} users) on WhatsApp? This messages real users.
                </span>
                <div className="cmp-confirm-actions">
                  <button className="cmp-btn-ghost" disabled={sending} onClick={() => setConfirming(false)}>Cancel</button>
                  <button className="cmp-btn danger" disabled={sending} onClick={doSend}>{sending ? 'Sending…' : 'Confirm send'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
