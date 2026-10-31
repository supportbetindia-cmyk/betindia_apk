'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2, Users, Webhook, MessageCircleMore, Building2, Sliders, CalendarDays } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { BackendApiError, backendRequest, getSelectedTenantId, type BackendMe } from '@/lib/backend-api';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Tier = { name: string; min: number };
type Config = {
  inactivity: { atRiskDays: number; inactiveDays: number };
  regularPlayerMinDeposits: number;
  valueTiers: Tier[];
};
type Summary = { lifecycle: { key: string | null; count: number }[]; category: { key: string | null; count: number }[] };

// Links to the other config pages so this is the single "Admin" home.
const HUB = [
  { icon: Users, label: 'Team & roles', desc: 'Invite people, set who can do what', href: '/settings/team' },
  { icon: Webhook, label: 'Webhook settings', desc: 'Keys and endpoints for live data', href: '/webhooks' },
  { icon: MessageCircleMore, label: 'WhatsApp templates', desc: 'Interakt accounts and message names', href: '/settings/whatsapp' },
  { icon: Building2, label: 'Departments', desc: 'Organise your teams', href: '/settings/departments' },
];

export default function AdminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenantId = getSelectedTenantId();
  const [draft, setDraft] = useState<Config | null>(null);
  const [notice, setNotice] = useState('');

  const config = useQuery({
    queryKey: ['classification-config', tenantId],
    queryFn: () => backendRequest<Config>('/classification/config'),
    enabled: Boolean(tenantId),
  });
  const summary = useQuery({
    queryKey: ['classification-summary', tenantId],
    queryFn: () => backendRequest<Summary>('/classification/summary'),
    enabled: Boolean(tenantId),
  });

  // Seed the editable form once the saved config loads.
  useEffect(() => { if (config.data && !draft) setDraft(config.data); }, [config.data, draft]);

  // "Reporting week" — which weekday a week starts on (0=Sun..6=Sat).
  const [weekDraft, setWeekDraft] = useState<number | null>(null);
  const me = useQuery({
    queryKey: ['me', tenantId],
    queryFn: () => backendRequest<BackendMe>('/me', { tenantId: null }),
    enabled: Boolean(tenantId),
  });
  const currentWeekStart = me.data?.tenants.find((t) => t.id === tenantId)?.weekStartDay ?? 1;
  useEffect(() => { if (me.data && weekDraft === null) setWeekDraft(currentWeekStart); }, [me.data, weekDraft, currentWeekStart]);
  const saveWeek = useMutation({
    mutationFn: (weekStartDay: number) =>
      backendRequest<{ weekStartDay: number }>('/tenants/current/settings', { method: 'PUT', body: JSON.stringify({ weekStartDay }) }),
    onSuccess: (saved) => {
      setWeekDraft(saved.weekStartDay);
      setNotice(`Saved. Weeks now start on ${WEEKDAYS[saved.weekStartDay]} across this company's reports.`);
      queryClient.invalidateQueries({ queryKey: ['me', tenantId] });
    },
  });

  // "Loss commission" — % of a player's weekly net loss paid back (Analytics page).
  const [commDraft, setCommDraft] = useState<number | null>(null);
  const currentComm = me.data?.tenants.find((t) => t.id === tenantId)?.lossCommissionPct ?? 3;
  useEffect(() => { if (me.data && commDraft === null) setCommDraft(currentComm); }, [me.data, commDraft, currentComm]);
  const saveComm = useMutation({
    mutationFn: (lossCommissionPct: number) =>
      backendRequest<{ lossCommissionPct: number }>('/tenants/current/settings', { method: 'PUT', body: JSON.stringify({ lossCommissionPct }) }),
    onSuccess: (saved) => {
      setCommDraft(saved.lossCommissionPct);
      setNotice(`Saved. Loss commission is now ${saved.lossCommissionPct}% for this company.`);
      queryClient.invalidateQueries({ queryKey: ['me', tenantId] });
    },
  });

  const save = useMutation({
    mutationFn: (cfg: Config) => backendRequest<Config>('/classification/config', { method: 'PUT', body: JSON.stringify(cfg) }),
    onSuccess: (saved) => {
      setDraft(saved);
      setNotice('Saved. Click "Regroup players now" to apply it to everyone.');
      queryClient.invalidateQueries({ queryKey: ['classification-config', tenantId] });
    },
  });
  const recompute = useMutation({
    mutationFn: () => backendRequest<{ changed: number }>('/classification/recompute', { method: 'POST' }),
    onSuccess: (r) => {
      setNotice(`Done — ${r.changed} player${r.changed === 1 ? '' : 's'} moved group.`);
      queryClient.invalidateQueries({ queryKey: ['classification-summary', tenantId] });
    },
  });

  const error = config.error || summary.error || save.error || recompute.error || me.error || saveWeek.error || saveComm.error;
  useEffect(() => {
    if (error instanceof BackendApiError && error.status === 401) router.replace('/saas-login');
  }, [error, router]);

  const setTier = (i: number, patch: Partial<Tier>) =>
    setDraft((d) => d && { ...d, valueTiers: d.valueTiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addTier = () => setDraft((d) => d && { ...d, valueTiers: [...d.valueTiers, { name: '', min: 0 }] });
  const delTier = (i: number) => setDraft((d) => d && { ...d, valueTiers: d.valueTiers.filter((_, j) => j !== i) });

  return <div className="shell">
    <Sidebar />
    <main className="main">
      <header className="topbar2"><div>
        <h1 className="page-title">Admin</h1>
        <p className="page-sub">One place to set up how this company works.</p>
      </div></header>

      {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}
      {error ? <div className="banner2" role="alert">{error instanceof Error ? error.message : 'Something went wrong'}</div> : null}
      {notice ? <div className="banner2 banner-ok">{notice}</div> : null}

      {tenantId && draft ? <>
        {/* ---- Player grouping rules (classification thresholds) ---- */}
        <section className="panel">
          <div className="webhook-heading"><span><Sliders size={20} /></span><div>
            <h2>Player grouping rules</h2><p>How players are automatically sorted into stages and value groups.</p>
          </div></div>

          <div style={{ display: 'grid', gap: 14, maxWidth: 620, marginTop: 8 }}>
            <label style={{ fontSize: 14, color: '#334155' }}>
              Mark a player <b>“At risk”</b> after this many days with no deposit
              <input type="number" min={1} value={draft.inactivity.atRiskDays}
                onChange={(e) => setDraft({ ...draft, inactivity: { ...draft.inactivity, atRiskDays: Number(e.target.value) } })}
                style={inputStyle} />
            </label>
            <label style={{ fontSize: 14, color: '#334155' }}>
              Mark a player <b>“Inactive”</b> after this many days with no deposit
              <input type="number" min={1} value={draft.inactivity.inactiveDays}
                onChange={(e) => setDraft({ ...draft, inactivity: { ...draft.inactivity, inactiveDays: Number(e.target.value) } })}
                style={inputStyle} />
            </label>
            <label style={{ fontSize: 14, color: '#334155' }}>
              A player becomes a <b>“Regular player”</b> at this many deposits
              <input type="number" min={1} value={draft.regularPlayerMinDeposits}
                onChange={(e) => setDraft({ ...draft, regularPlayerMinDeposits: Number(e.target.value) })}
                style={inputStyle} />
            </label>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Value groups</div>
            <p className="page-sub" style={{ marginTop: 0 }}>By total money deposited (highest first). A player joins the top group they qualify for.</p>
            <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
              {draft.valueTiers.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} placeholder="Group name (e.g. Gold)" style={{ ...inputStyle, flex: 1, marginTop: 0 }} />
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>≥ ₹</span>
                  <input type="number" min={0} value={t.min} onChange={(e) => setTier(i, { min: Number(e.target.value) })} style={{ ...inputStyle, width: 130, marginTop: 0 }} />
                  <button className="team-remove" onClick={() => delTier(i)} aria-label="Remove group"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <button className="btn-ghost" onClick={addTier} style={{ marginTop: 8 }}><Plus size={15} /> Add group</button>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
            <button className="btn-primary" onClick={() => { setNotice(''); save.mutate(draft); }} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save rules'}
            </button>
            <button className="btn-ghost" onClick={() => { setNotice(''); recompute.mutate(); }} disabled={recompute.isPending}>
              <RefreshCw size={15} /> {recompute.isPending ? 'Regrouping…' : 'Regroup players now'}
            </button>
          </div>
        </section>

        {/* ---- Reporting week (which day a week starts on) ---- */}
        <section className="panel">
          <div className="webhook-heading"><span><CalendarDays size={20} /></span><div>
            <h2>Reporting week</h2><p>The day each week begins for “This week / Last week” on the dashboard and reports.</p>
          </div></div>
          <div style={{ display: 'grid', gap: 10, maxWidth: 360, marginTop: 8 }}>
            <label style={{ fontSize: 14, color: '#334155' }}>
              Week starts on
              <select value={weekDraft ?? 1} onChange={(e) => setWeekDraft(Number(e.target.value))} style={inputStyle}>
                {WEEKDAYS.map((name, i) => <option key={i} value={i}>{name}</option>)}
              </select>
            </label>
            <div>
              <button className="btn-primary" disabled={saveWeek.isPending || weekDraft === null || weekDraft === currentWeekStart}
                onClick={() => { setNotice(''); if (weekDraft !== null) saveWeek.mutate(weekDraft); }}>
                {saveWeek.isPending ? 'Saving…' : 'Save week start'}
              </button>
            </div>
          </div>
        </section>

        {/* ---- Loss commission (% of weekly net loss paid back) ---- */}
        <section className="panel">
          <div className="webhook-heading"><span><CalendarDays size={20} /></span><div>
            <h2>Loss commission</h2><p>Percentage of a player’s net loss paid back to them. Shown on the Analytics report.</p>
          </div></div>
          <div style={{ display: 'grid', gap: 10, maxWidth: 360, marginTop: 8 }}>
            <label style={{ fontSize: 14, color: '#334155' }}>
              Commission rate (%)
              <input type="number" min={0} max={100} value={commDraft ?? 3}
                onChange={(e) => setCommDraft(Number(e.target.value))} style={inputStyle} />
            </label>
            <div>
              <button className="btn-primary" disabled={saveComm.isPending || commDraft === null || commDraft === currentComm}
                onClick={() => { setNotice(''); if (commDraft !== null) saveComm.mutate(commDraft); }}>
                {saveComm.isPending ? 'Saving…' : 'Save commission rate'}
              </button>
            </div>
          </div>
        </section>

        {/* ---- Current distribution (so they see the effect) ---- */}
        <section className="panel">
          <div className="webhook-heading"><span><Users size={20} /></span><div>
            <h2>Right now</h2><p>How your players are grouped today.</p>
          </div></div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
            <Distribution title="Stages" rows={summary.data?.lifecycle} />
            <Distribution title="Value groups" rows={summary.data?.category} />
          </div>
        </section>

        {/* ---- Hub: links to the other config pages ---- */}
        <section className="panel">
          <div className="webhook-heading"><div><h2>More settings</h2><p>Everything else for this company.</p></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 8 }}>
            {HUB.map(({ icon: Icon, label, desc, href }) => (
              <Link key={href} href={href} className="admin-hub-card"
                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, border: '1px solid #eef2f7', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
                <span style={{ color: '#4f46e5' }}><Icon size={22} /></span>
                <span><b style={{ display: 'block' }}>{label}</b><small style={{ color: '#64748b' }}>{desc}</small></span>
              </Link>
            ))}
          </div>
        </section>
      </> : tenantId ? <div className="panel"><div className="empty2">Loading…</div></div> : null}
    </main>
  </div>;
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 6, padding: '9px 11px',
  border: '1px solid #d7dded', borderRadius: 8, fontSize: 14,
};

function Distribution({ title, rows }: { title: string; rows?: { key: string | null; count: number }[] }) {
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {rows?.length ? rows.map((r) => (
        <div key={r.key ?? 'none'} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
          <span style={{ color: '#475569' }}>{r.key ?? 'No group'}</span>
          <b>{r.count.toLocaleString()}</b>
        </div>
      )) : <div className="page-sub">No data yet.</div>}
    </div>
  );
}
