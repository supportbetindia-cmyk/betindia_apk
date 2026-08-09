'use client';

import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  BadgeCheck,
  BellOff,
  ChartNoAxesColumnIncreasing,
  Eye,
  Send,
  Smartphone,
} from 'lucide-react';

type Row = {
  id: string;
  title: string;
  audience: string;
  sent: number;
  delivered: number;
  opened: number;
  ctr: number;
  status: string;
  at: number;
};
type Data = {
  configured: boolean;
  error?: string;
  summary?: {
    sent: number;
    delivered: number;
    opened: number;
    openRate: number;
    subscribers: number | null;
    totalDevices?: number | null;
    unsubscribed?: number | null;
  };
  segments?: string[];
  recent?: Row[];
};

const DEFAULT_SEGMENTS = ['Subscribed Users', 'Active Users', 'Engaged Users', 'Inactive Users'];

const REFRESH_MS = 30000; // push stats change slowly; poll gently

export function Notifications() {
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      setData(await res.json());
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (data && data.configured === false) {
    return (
      <div className="panel">
        <div className="panel-head"><h3>Push Notifications</h3><span className="panel-tag">OneSignal</span></div>
        <div className="empty2">
          Connect OneSignal to see push stats.<br />
          Add <b>ONESIGNAL_APP_ID</b> and <b>ONESIGNAL_REST_API_KEY</b> to <code>dashboard/.env.local</code>, then restart.
        </div>
      </div>
    );
  }

  const s = data?.summary;
  const rows = data?.recent ?? [];
  const segments = data?.segments && data.segments.length ? data.segments : DEFAULT_SEGMENTS;

  return (
    <>
      <Composer segments={segments} subscribers={s?.subscribers ?? null} onSent={load} />

      <div className="panel">
        <div className="panel-head"><h3>Notification Summary</h3><span className="panel-tag">OneSignal · Push</span></div>
        {data?.error ? <div className="panel-note">OneSignal error: {data.error}</div> : null}
        <div className="notif-summary">
          <NotifTile label="Subscribers" value={s?.subscribers ?? '—'} color="#4f46e5" icon={<Smartphone size={18} />} />
          <NotifTile label="Sent" value={(s?.sent ?? 0).toLocaleString()} color="#2563eb" icon={<Send size={18} />} />
          <NotifTile label="Delivered" value={(s?.delivered ?? 0).toLocaleString()} color="#059669" icon={<BadgeCheck size={18} />} />
          <NotifTile label="Opened" value={(s?.opened ?? 0).toLocaleString()} color="#d97706" icon={<Eye size={18} />} />
          <NotifTile label="Open Rate" value={`${s?.openRate ?? 0}%`} color="#0891b2" icon={<ChartNoAxesColumnIncreasing size={18} />} />
          <NotifTile
            label="Uninstalled / Off"
            value={s?.unsubscribed ?? '—'}
            color="#ef4444"
            icon={<BellOff size={18} />}
          />
        </div>
        <div className="panel-note">
          “Uninstalled / Off” ≈ devices that became unreachable (app removed <b>or</b> notifications turned off) —
          {s?.totalDevices != null ? ` ${s.totalDevices.toLocaleString()} devices ever seen, ${s?.subscribers ?? 0} still reachable.` : ' the closest signal to uninstalls.'}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Recent Notifications</h3><span className="panel-tag">Last {rows.length}</span></div>
        {rows.length ? (
          <div className="notif-table">
            <div className="notif-head">
              <span>Title</span><span>Audience</span><span>Sent</span><span>Delivered</span><span>Opened</span><span>CTR</span><span>Status</span>
            </div>
            {rows.map((r) => (
              <div className="notif-row" key={r.id}>
                <span className="notif-title" title={r.title}>{r.title}</span>
                <span className="notif-aud">{r.audience}</span>
                <span>{r.sent.toLocaleString()}</span>
                <span>{r.delivered.toLocaleString()}</span>
                <span>{r.opened.toLocaleString()}</span>
                <span>{r.ctr}%</span>
                <span className={`notif-status s-${r.status.toLowerCase()}`}>{r.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty2">No notifications sent yet.</div>
        )}
      </div>
    </>
  );
}

function Composer({
  segments,
  subscribers,
  onSent,
}: {
  segments: string[];
  subscribers: number | null;
  onSent: () => void;
}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState(segments[0] ?? 'Subscribed Users');
  const [url, setUrl] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const canSend = title.trim() && message.trim();

  async function doSend() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, segment, url }),
      });
      const body = await res.json();
      if (res.ok) {
        setResult({ ok: true, text: `Sent to ${body.recipients ?? '—'} recipients.` });
        setTitle('');
        setMessage('');
        setUrl('');
        onSent();
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
    <div className="panel">
      <div className="panel-head"><h3>Send Push Notification</h3><span className="panel-tag">OneSignal</span></div>

      <div className="composer">
        <input className="cmp-input" placeholder="Notification title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} />
        <textarea className="cmp-textarea" placeholder="Message body…" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={240} rows={3} />
        <div className="cmp-row">
          <label className="cmp-label">
            Audience
            <select className="cmp-select" value={segment} onChange={(e) => setSegment(e.target.value)}>
              {segments.map((sg) => (
                <option key={sg} value={sg}>{sg}</option>
              ))}
            </select>
          </label>
          <label className="cmp-label">
            Launch URL (optional)
            <input className="cmp-input" placeholder="https://www.betindia.bet/deposit" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        </div>

        {result ? <div className={result.ok ? 'cmp-ok' : 'cmp-err'}>{result.text}</div> : null}

        {!confirming ? (
          <button className="cmp-btn" disabled={!canSend || sending} onClick={() => setConfirming(true)}>
            Review &amp; Send
          </button>
        ) : (
          <div className="cmp-confirm">
            <span>
              Send “<b>{title}</b>” to <b>{segment}</b>
              {subscribers != null ? ` (~${subscribers.toLocaleString()} devices)` : ''}? This goes to real users.
            </span>
            <div className="cmp-confirm-actions">
              <button className="cmp-btn-ghost" disabled={sending} onClick={() => setConfirming(false)}>Cancel</button>
              <button className="cmp-btn danger" disabled={sending} onClick={doSend}>{sending ? 'Sending…' : 'Confirm send'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotifTile({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: ReactNode }) {
  return (
    <div className="notif-tile" style={{ '--accent': color } as CSSProperties}>
      <div className="notif-tile-icon">{icon}</div>
      <div>
        <div className="notif-tile-value">{value}</div>
        <div className="notif-tile-label">{label}</div>
      </div>
    </div>
  );
}
