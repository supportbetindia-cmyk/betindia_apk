'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, MessageCircleMore, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Account = {
  role: string; label: string; enabled: boolean;
  hasKey: boolean; maskedKey: string; templates: Record<string, string>;
  activeKey: boolean;
};
type Row = { name: string; value: string; fixed: boolean };

// The 6 template names the deposit/withdrawal automation looks up — locked on the
// 'updates' account so they can't be renamed by accident.
const UPDATES_KEYS = ['deposit_approved', 'deposit_pending', 'deposit_rejected', 'withdrawal_approved', 'withdrawal_pending', 'withdrawal_rejected'];

// Plain-English description of what each known account is used for.
const ROLE_INFO: Record<string, { title: string; purpose: string }> = {
  updates: { title: 'Transaction updates', purpose: 'Automatically messages a player when their deposit or withdrawal is approved, pending or rejected.' },
  retention: { title: 'Win-back & campaigns', purpose: 'Used to message inactive players (win-back) and to send marketing campaigns.' },
};
function roleInfo(role: string) {
  return ROLE_INFO[role] ?? { title: role, purpose: 'A WhatsApp account you can send messages and campaigns from.' };
}

// One clear status line: is this account going to send, and with which key?
function statusOf(a: Account): { text: string; color: string; bg: string; ok: boolean } {
  if (!a.enabled) return { text: 'Turned off', color: '#6b7280', bg: '#f3f4f6', ok: false };
  if (a.hasKey) return { text: 'Working — using its own key', color: '#15803d', bg: '#ecfdf3', ok: true };
  if (a.activeKey) return { text: 'Working — using the default key', color: '#b45309', bg: '#fff7ed', ok: true };
  return { text: 'Not working — no key added', color: '#b91c1c', bg: '#fef2f2', ok: false };
}

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
async function remove(role: string): Promise<Account[]> {
  const res = await fetch(`/api/whatsapp-settings?role=${encodeURIComponent(role)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Remove failed');
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

  // The two accounts that drive automation — surfaced at the top so the user sees
  // at a glance whether their most important messages will actually send.
  const key = (r: string) => accounts?.find((a) => a.role === r);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">WhatsApp accounts</h1>
            <p className="page-sub">Connect one Interakt account per job — one for transaction updates, one for win-back and campaigns, and so on.</p>
          </div>
        </header>

        {!accounts ? <div className="panel"><div className="empty2">Loading…</div></div> : <>
          {/* At-a-glance: are the important messages going to send? */}
          <div className="panel">
            <div style={{ fontWeight: 700, marginBottom: 10 }}>How your messages are sent right now</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <OverviewTile title="Deposit / withdrawal updates" account={key('updates')} missing="No 'updates' account yet" />
              <OverviewTile title="Win-back & campaigns" account={key('retention')} missing="No 'retention' account yet" />
            </div>
          </div>

          {accounts.map((a) => (
            <AccountCard key={a.role} account={a} onSaved={setAccounts} onRemoved={setAccounts} />
          ))}
          {accounts.length === 0 ? <div className="panel"><div className="empty2">No accounts yet. Add your first one below.</div></div> : null}

          <div className="panel">
            <div className="panel-head"><h3>Add an account</h3></div>
            <p className="page-sub" style={{ marginTop: 0 }}>
              Common jobs: <b>updates</b> (transaction messages) and <b>retention</b> (win-back &amp; campaigns). You can add any other job too.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="job (e.g. retention)" style={{ width: 200 }} />
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="name (e.g. BetIndia Club)" style={{ width: 240 }} />
              <Button onClick={addAccount} disabled={!newRole.trim()}><Plus size={15} /> Add</Button>
              {err ? <span style={{ color: '#b91c1c', fontSize: 13 }}>{err}</span> : null}
            </div>
          </div>
        </>}
      </main>
    </div>
  );
}

function OverviewTile({ title, account, missing }: { title: string; account?: Account; missing: string }) {
  const status = account ? statusOf(account) : null;
  return (
    <div style={{ border: '1px solid #eef2f7', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>{title}</div>
      {status ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {status.ok ? <CheckCircle2 size={18} color="#15803d" /> : <XCircle size={18} color="#b91c1c" />}
          <b style={{ color: status.ok ? '#15803d' : '#b91c1c' }}>{status.text}</b>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b45309' }}>
          <XCircle size={18} /> <b>{missing}</b>
        </div>
      )}
    </div>
  );
}

function toRows(account: Account): Row[] {
  return Object.entries(account.templates).map(([name, value]) => ({
    name, value, fixed: account.role === 'updates' && UPDATES_KEYS.includes(name),
  }));
}

function AccountCard({ account, onSaved, onRemoved }: { account: Account; onSaved: (a: Account[]) => void; onRemoved: (a: Account[]) => void }) {
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
  const info = roleInfo(account.role);

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
    const templates: Record<string, string> = {};
    for (const row of rows) if (row.name.trim()) templates[row.name.trim()] = row.value.trim();
    try {
      onSaved(await save({ role: account.role, label, enabled, apiKey: newKey || undefined, templates }));
      setNewKey(''); setMsg('Saved.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function removeAccount() {
    if (!window.confirm(`Remove the "${account.label}" account? Messages for this job will stop sending.`)) return;
    setMsg(null);
    try { onRemoved(await remove(account.role)); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Remove failed'); }
  }

  return (
    <div className="panel">
      <div className="panel-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <MessageCircleMore size={18} color="#25D366" />
            {account.label} <span className="page-sub" style={{ fontWeight: 400 }}>· {account.role}</span>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: status.color, background: status.bg }}>{status.text}</span>
          </h3>
          <p className="page-sub" style={{ margin: 0 }}>{info.purpose}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> On
          </label>
          <button onClick={removeAccount} title="Remove account" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#cbd5e1' }}><Trash2 size={16} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
        <label style={{ fontSize: 13, color: '#475569' }}>
          <div style={{ marginBottom: 4 }}>Display name</div>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, color: '#475569' }}>
          <div style={{ marginBottom: 4 }}>
            Interakt API key {account.hasKey ? <b>(saved: {account.maskedKey})</b> : <i>(none yet — paste to connect)</i>}
          </div>
          <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Paste a new key, or leave blank to keep the saved one" />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>Message templates</div>
        <p className="page-sub" style={{ marginTop: 0, marginBottom: 8 }}>
          {account.role === 'updates'
            ? 'These 6 names must match your approved Interakt templates for deposit/withdrawal updates.'
            : 'Give each message a short name on the left, and the exact Interakt template name on the right.'}
        </p>
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
        <Button variant="outline" onClick={addRow} style={{ marginTop: 8 }}><Plus size={15} /> Add template</Button>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eef2f7' }}>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>Send a test to your own number — proves the key works (sends one real message):</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Your phone (e.g. 9876543210)" style={{ width: 240 }} />
          <Button variant="outline" onClick={runTest} disabled={testing || !testPhone.trim()}><Send size={14} /> {testing ? 'Sending…' : 'Send test'}</Button>
          {testMsg ? <span style={{ color: testMsg.ok ? '#15803d' : '#b91c1c', fontSize: 13 }}>{testMsg.text}</span> : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        {msg ? <span style={{ color: msg === 'Saved.' ? '#15803d' : '#b91c1c', fontSize: 13 }}>{msg}</span> : null}
      </div>
    </div>
  );
}
