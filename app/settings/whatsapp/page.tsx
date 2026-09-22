'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Account = {
  role: string; label: string; enabled: boolean;
  hasKey: boolean; maskedKey: string; templates: Record<string, string>;
  activeKey: boolean;
};

// Plain badge: is this account actually going to send, and with which key?
function statusOf(a: Account): { text: string; color: string; bg: string } {
  if (!a.enabled) return { text: 'Off', color: '#6b7280', bg: '#f3f4f6' };
  if (a.hasKey) return { text: 'Active · using its own key', color: '#15803d', bg: '#ecfdf3' };
  if (a.activeKey) return { text: 'Active · using default key', color: '#b45309', bg: '#fff7ed' };
  return { text: 'No key — won’t send', color: '#b91c1c', bg: '#fef2f2' };
}
type Row = { name: string; value: string; fixed: boolean };

// The 6 template names the deposit/withdrawal automation looks up — locked on the
// 'updates' account so they can't be renamed by accident.
const UPDATES_KEYS = ['deposit_approved', 'deposit_pending', 'deposit_rejected', 'withdrawal_approved', 'withdrawal_pending', 'withdrawal_rejected'];

async function load(): Promise<Account[]> {
  const res = await fetch('/api/whatsapp-settings');
  return (await res.json()).accounts ?? [];
}
async function save(body: Record<string, unknown>): Promise<Account[]> {
  const res = await fetch('/api/whatsapp-settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `Save failed (${res.status})`);
  return (await res.json()).accounts ?? [];
}

export default function WhatsAppSettingsPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [newRole, setNewRole] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { load().then(setAccounts); }, []);

  async function addAccount() {
    const role = newRole.trim().toLowerCase();
    if (!role) return;
    setErr(null);
    try {
      setAccounts(await save({ role, label: newLabel.trim() || role }));
      setNewRole(''); setNewLabel('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add account'); }
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">WhatsApp accounts</h1>
            <p className="page-sub">One Interakt account per purpose — updates, retention, and so on</p>
          </div>
        </header>

        {!accounts ? <div className="panel"><div className="empty2">Loading…</div></div> : <>
          {accounts.map((a) => <AccountCard key={a.role} account={a} onSaved={setAccounts} />)}
          {accounts.length === 0 ? <div className="panel"><div className="empty2">No accounts yet. Add one below.</div></div> : null}

          <div className="panel">
            <div className="panel-head"><h3>Add an account</h3></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="role (e.g. retention)" style={{ width: 200 }} />
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="label (e.g. BetIndia Club)" style={{ width: 240 }} />
              <Button onClick={addAccount} disabled={!newRole.trim()}>Add</Button>
              {err ? <span style={{ color: '#b91c1c', fontSize: 13 }}>{err}</span> : null}
            </div>
          </div>
        </>}
      </main>
    </div>
  );
}

function toRows(account: Account): Row[] {
  return Object.entries(account.templates).map(([name, value]) => ({
    name, value, fixed: account.role === 'updates' && UPDATES_KEYS.includes(name),
  }));
}

function AccountCard({ account, onSaved }: { account: Account; onSaved: (a: Account[]) => void }) {
  const [label, setLabel] = useState(account.label);
  const [newKey, setNewKey] = useState('');
  const [enabled, setEnabled] = useState(account.enabled);
  const [rows, setRows] = useState<Row[]>(toRows(account));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const status = statusOf(account);

  async function runTest() {
    if (!testPhone.trim()) return;
    setTesting(true); setTestMsg(null);
    try {
      const res = await fetch('/api/whatsapp-settings/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: account.role, phone: testPhone.trim() }),
      });
      const d = await res.json();
      setTestMsg(d.ok ? { ok: true, text: 'Sent — this key works ✓' } : { ok: false, text: d.error || 'Not working' });
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : 'Test failed' });
    } finally { setTesting(false); }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => j === i ? { ...row, ...patch } : row));
  const addRow = () => setRows((r) => [...r, { name: '', value: '', fixed: false }]);
  const delRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  async function submit() {
    setSaving(true); setMsg(null);
    // Build the name -> template map, dropping rows with no name.
    const templates: Record<string, string> = {};
    for (const row of rows) if (row.name.trim()) templates[row.name.trim()] = row.value.trim();
    try {
      onSaved(await save({ role: account.role, label, enabled, apiKey: newKey || undefined, templates }));
      setNewKey(''); setMsg('Saved.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {account.label} <span className="page-sub" style={{ fontWeight: 400 }}>· {account.role}</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: status.color, background: status.bg }}>{status.text}</span>
        </h3>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
      </div>

      <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
        <label style={{ fontSize: 13, color: '#475569' }}>
          <div style={{ marginBottom: 4 }}>Label</div>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, color: '#475569' }}>
          <div style={{ marginBottom: 4 }}>
            Interakt API key {account.hasKey ? <b>(current: {account.maskedKey})</b> : <i>(none — paste to set)</i>}
          </div>
          <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Paste new key, or leave blank to keep" />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Templates</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input value={row.name} disabled={row.fixed} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="name (e.g. welcome)" style={{ width: 240 }} />
              <span style={{ color: '#94a3b8' }}>→</span>
              <Input value={row.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="Interakt template name" style={{ flex: 1 }} />
              {row.fixed ? <span style={{ width: 32 }} /> : (
                <button onClick={() => delRow(i)} title="Remove" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={addRow} style={{ marginTop: 8 }}>+ Add template</Button>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eef2f7' }}>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>Test this key — sends one real message to your number:</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Your phone (e.g. 9876543210)" style={{ width: 240 }} />
          <Button variant="outline" onClick={runTest} disabled={testing || !testPhone.trim()}>{testing ? 'Sending…' : 'Send test'}</Button>
          {testMsg ? <span style={{ color: testMsg.ok ? '#15803d' : '#b91c1c', fontSize: 13 }}>{testMsg.text}</span> : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        {msg ? <span style={{ color: msg === 'Saved.' ? '#15803d' : '#b91c1c', fontSize: 13 }}>{msg}</span> : null}
      </div>
    </div>
  );
}
