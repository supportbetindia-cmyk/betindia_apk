'use client';

import { useCallback, useEffect, useState } from 'react';
import { Radio } from 'lucide-react';

type Log = {
  id: number;
  source: string | null;
  method: string | null;
  content_type: string | null;
  token_ok: boolean | null;
  status: number | null;
  ip: string | null;
  created_at: string;
};

export function WebhookActivity() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [notSetup, setNotSetup] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/webhook-logs', { cache: 'no-store' });
      const body = await res.json();
      if (body.configured === false) setNotSetup(true);
      setLogs(body.logs ?? []);
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Webhook Activity</h3>
        <span className="panel-tag live"><Radio size={12} /> Live · auto-refresh</span>
      </div>
      {notSetup ? (
        <div className="empty2">
          Run <code>sql/webhook_logs.sql</code> in Supabase to enable webhook activity logging.
        </div>
      ) : logs.length === 0 ? (
        <div className="empty2">
          No webhook calls received yet. When the platform calls your URL, every hit shows here —
          including rejected ones. If this stays empty while transactions happen, the platform isn&apos;t calling you.
        </div>
      ) : (
        <div className="txn-table">
          <div className="txn-head">
            <span>Time</span><span>Type</span><span>Result</span><span>Content-Type</span><span>IP</span>
          </div>
          {logs.map((l) => (
            <div className="txn-row" key={l.id}>
              <span className="txn-mono">{new Date(l.created_at).toLocaleString()}</span>
              <span className={`txn-type t-${l.source === 'withdrawal' ? 'withdrawal' : 'deposit'}`}>{l.source ?? '—'}</span>
              <span className={`notif-status ${l.token_ok && l.status === 200 ? 's-completed' : 's-scheduled'}`}>
                {l.token_ok ? (l.status === 200 ? 'Saved' : `Error ${l.status}`) : 'Bad token'}
              </span>
              <span className="txn-mono">{l.content_type ?? '—'}</span>
              <span className="txn-mono">{l.ip ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
