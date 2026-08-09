'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Metrics, Count } from '@/lib/metrics';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { KpiCard } from '@/components/KpiCard';
import { AreaChart } from '@/components/AreaChart';
import { Donut } from '@/components/Donut';
import type { DateRangeKey } from '@/lib/date-range';
import {
  Activity,
  Download,
  MapPin,
  Radio,
  UserPlus,
  UsersRound,
} from 'lucide-react';

// Metrics are aggregated server-side and refreshed at most every 30 seconds.
const REFRESH_MS = 30_000;

type MetricsResponse = Metrics & {
  meta?: {
    generatedAt?: string;
    cache?: 'miss' | 'hit' | 'shared' | 'stale';
  };
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function  SourceList({ items, empty, note }: { items: Count[]; empty: string; note?: string }) {
  const colors = ['#3b82f6', '#ec4899', '#22c55e', '#7c6cf6', '#06b6d4', '#22c55e', '#f59e0b'];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!items.length) return <div className="empty2">{empty}</div>;
  return (
    <>
      {note ? <div className="panel-note">{note}</div> : null}
      {items.map((it, i) => {
        const pct = total ? Math.round((it.value / total) * 1000) / 10 : 0;
        const max = Math.max(...items.map((x) => x.value), 1);
        return (
          <div className="src-row" key={it.label}>
            <span className="src-dot" style={{ background: colors[i % colors.length] }} />
            <span className="src-name" title={it.label}>{it.label}</span>
            <div className="src-track">
              <div className="src-fill" style={{ width: `${(it.value / max) * 100}%`, background: colors[i % colors.length] }} />
            </div>
            <span className="src-val">{it.value.toLocaleString()}</span>
            <span className="src-pct">{pct}%</span>
          </div>
        );
      })}
    </>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [range, setRange] = useState<DateRangeKey>('7d');

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const changeRange = useCallback((nextRange: DateRangeKey) => {
    setRange(nextRange);
    setM(null);
    setError(null);
    setLastSync(null);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/metrics?range=${range}`, { cache: 'no-store' });
      const body = (await res.json()) as MetricsResponse & { message?: string };
      if (!res.ok) return setError(body.message || 'Failed to load metrics');
      setM(body as Metrics);
      setError(null);
      const generatedAt = body.meta?.generatedAt;
      setLastSync(generatedAt ? new Date(generatedAt) : new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [range]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const quickStats = [
    { label: 'App Version', value: '0.1.0' },
    { label: 'Live Users', value: String(m?.liveUsers ?? 0) },
    { label: 'Total Events', value: (m?.eventsByName.reduce((s, e) => s + e.value, 0) ?? 0).toLocaleString() },
    { label: 'Last Updated', value: lastSync ? lastSync.toLocaleTimeString() : '—' },
  ];

  return (
    <div className="shell">
      <Sidebar quickStats={quickStats} />

      <main className="main">
        <Topbar lastSync={lastSync} range={range} onRangeChange={changeRange} onLogout={logout} />

        {error ? (
          <div className="banner2">
            {error.includes('configured') || error.includes('SERVICE_ROLE')
              ? 'Dashboard not configured — set the service_role key in dashboard/.env.local.'
              : `Data read blocked: ${error}. (Enable the anon read policy or use the service_role key.)`}
          </div>
        ) : null}

        {/* KPI ROW */}
        <div className="kpi-grid">
          <KpiCard label="Known Devices" kpi={m?.kpis.installs ?? z} icon={<Download size={20} />} color="#4f46e5" comparisonLabel="unique SDK device IDs" />
          <KpiCard label="Active Devices" kpi={m?.kpis.activeUsers ?? z} icon={<UsersRound size={20} />} color="#2563eb" comparisonLabel={m?.range.label ?? 'selected period'} />
          <KpiCard label="New Devices" kpi={m?.kpis.newUsers ?? z} icon={<UserPlus size={20} />} color="#059669" comparisonLabel={m?.range.label ?? 'selected period'} />
          <KpiCard label="Identified Users" kpi={{ value: m?.identity.identifiedUsers ?? 0, deltaPct: null }} icon={<UsersRound size={20} />} color="#7c3aed" comparisonLabel="real account IDs" />
          <KpiCard label="Active Users" kpi={{ value: m?.identity.activeIdentifiedUsers ?? 0, deltaPct: null }} icon={<UserPlus size={20} />} color="#0f766e" comparisonLabel={m?.range.label ?? 'selected period'} />
          <KpiCard label="Sessions" kpi={m?.kpis.sessions ?? z} icon={<Activity size={20} />} color="#d97706" comparisonLabel={m?.range.comparisonLabel} />
        </div>

        <div className="panel-note">
          <b>Measurement basis:</b> devices use the anonymous SDK ID; users require a real account ID from the app after login.
          {' '}Verified install events: <b>{m?.identity.verifiedInstalls ?? 0}</b>. Identity coverage for active devices: <b>{m?.identity.coveragePct ?? 0}%</b>
          {m && m.identity.identifiedUsers === 0 ? ' — account identity is not connected to the host login yet.' : '.'}
        </div>

        {/* CHARTS + TRAFFIC */}
        <div className="row-3">
          <div className="panel">
            <div className="panel-head"><h3>New Devices Overview</h3><span className="panel-tag">{m?.range.label ?? 'Loading…'}</span></div>
            <AreaChart points={m?.installsSeries ?? []} color="#4f46e5" />
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Active Devices</h3><span className="panel-tag">{m?.range.label ?? 'Loading…'}</span></div>
            <AreaChart points={m?.activeSeries ?? []} color="#2563eb" />
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Top Traffic Sources</h3></div>
            <SourceList
              items={m?.trafficSources ?? []}
              empty="No traffic data yet"
              note={m && !m.coverage.trafficSources ? 'Referrer/UTM capture just added — populates as new events arrive.' : undefined}
            />
          </div>
        </div>

        {/* DONUTS + COUNTRY + EVENTS */}
        <div className="row-3">
          <div className="panel">
            <div className="panel-head"><h3>Audience Overview</h3></div>
            <Donut slices={m?.audience ?? []} centerLabel="Users" />
          </div>
          <div className="panel">
            <div className="panel-head"><h3>User by Device</h3></div>
            <Donut slices={m?.devices ?? []} centerLabel="Users" />
          </div>
          <div className="panel">
            <div className="panel-head"><h3>App vs Website</h3><span className="panel-tag">platform</span></div>
            <Donut slices={m?.platforms ?? []} centerLabel="Users" />
          </div>
        </div>

        <div className="row-3">
          <div className="panel">
            <div className="panel-head"><h3>Events by Type</h3></div>
            <SourceList items={m?.eventsByName ?? []} empty="No events yet" />
          </div>
        </div>

        {/* CONVERSION FUNNEL */}
        <div className="panel">
          <div className="panel-head">
            <h3>Conversion Funnel</h3>
            <span className="panel-tag">{m?.range.label ?? 'selected period'} · unique users</span>
          </div>
          <div className="funnel">
            {(m?.funnel ?? []).map((step, i) => (
              <div className="funnel-row" key={step.label}>
                <div className="funnel-meta">
                  <span className="funnel-label">{i + 1}. {step.label}</span>
                  <span className="funnel-count">
                    {step.users.toLocaleString()} <span className="funnel-pct">({step.pct}%)</span>
                  </span>
                </div>
                <div className="funnel-track">
                  <div className="funnel-fill" style={{ width: `${Math.max(step.pct, 2)}%` }} />
                </div>
                {i > 0 && step.dropPct > 0 ? (
                  <div className="funnel-drop">▼ {step.dropPct}% dropped off from previous step</div>
                ) : null}
              </div>
            ))}
            {!m?.funnel?.length ? <div className="empty2">No funnel data yet</div> : null}
          </div>
        </div>

        {/* ENGAGEMENT: DAU / WAU / MAU */}
        <div className="panel">
          <div className="panel-head">
            <h3>Active Devices (DAU · WAU · MAU)</h3>
            <span className="panel-tag">fixed rolling windows · unique SDK devices</span>
          </div>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label">DAU · Daily active</div>
              <div className="kpi-value">{m?.activity.dau ?? 0}</div>
              <div className="kpi-delta"><span className="kpi-vs">active in last 24h</span></div>
            </div>
            <div className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label">WAU · Weekly active</div>
              <div className="kpi-value">{m?.activity.wau ?? 0}</div>
              <div className="kpi-delta"><span className="kpi-vs">active in last 7d</span></div>
            </div>
            <div className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label">MAU · Monthly active</div>
              <div className="kpi-value">{m?.activity.mau ?? 0}</div>
              <div className="kpi-delta"><span className="kpi-vs">active in last 30d</span></div>
            </div>
            <div className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label">Stickiness</div>
              <div className="kpi-value">{m?.activity.stickiness ?? 0}%</div>
              <div className="kpi-delta"><span className="kpi-vs">DAU ÷ MAU</span></div>
            </div>
          </div>
        </div>

        {/* USER ACTIVITY STATUS */}
        <div className="panel">
          <div className="panel-head">
            <h3>User Activity Status</h3>
            <span className="panel-tag">fixed rolling windows · by last activity</span>
          </div>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label status-label"><span className="status-indicator status-green" />Active (last 3d)</div>
              <div className="kpi-value">{m?.activity.active3d ?? 0}</div>
              <div className="kpi-delta"><span className="kpi-vs">playing recently</span></div>
            </div>
            <div className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label status-label"><span className="status-indicator status-blue" />Active (last 7d)</div>
              <div className="kpi-value">{m?.activity.active7d ?? 0}</div>
              <div className="kpi-delta"><span className="kpi-vs">active this week</span></div>
            </div>
            <div className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label status-label"><span className="status-indicator status-amber" />Inactive 7–30d</div>
              <div className="kpi-value">{m?.activity.inactive7to30 ?? 0}</div>
              <div className="kpi-delta"><span className="kpi-vs">not playing 7+ days</span></div>
            </div>
            <div className="kpi" style={{ display: 'block' }}>
              <div className="kpi-label status-label"><span className="status-indicator status-red" />Dormant 30d+</div>
              <div className="kpi-value">{m?.activity.inactive30plus ?? 0}</div>
              <div className="kpi-delta"><span className="kpi-vs">lost / churned</span></div>
            </div>
          </div>
        </div>

        {/* MOST VISITED GAMES */}
        <div className="panel">
          <div className="panel-head">
            <h3>Most Visited Games</h3>
            <span className="panel-tag">Page visits</span>
          </div>
          <div className="page-visit-grid">
            {(m?.pageVisits ?? [
              { label: 'Casino', value: 0 },
              { label: 'Cricket', value: 0 },
              { label: 'Tennis', value: 0 },
            ]).map((p) => (
              <div className="page-visit-card" key={p.label}>
                <div className="page-visit-label">{p.label}</div>
                <div className="page-visit-num">{p.value.toLocaleString()}</div>
                <div className="page-visit-sub">visits</div>
              </div>
            ))}
          </div>
        </div>

        {/* RETENTION */}
        <div className="panel">
          <div className="panel-head">
            <h3>Retention</h3>
            <span className="panel-tag">fixed cohort metric · D1 · D7 · D30</span>
          </div>
          <div className="page-visit-grid">
            {(m?.retention ?? [
              { label: 'D1', day: 1, rate: 0, cohort: 0, retained: 0 },
              { label: 'D7', day: 7, rate: 0, cohort: 0, retained: 0 },
              { label: 'D30', day: 30, rate: 0, cohort: 0, retained: 0 },
            ]).map((r) => (
              <div className="page-visit-card" key={r.label}>
                <div className="page-visit-label">{r.label}</div>
                <div className="page-visit-num">{r.rate}%</div>
                <div className="page-visit-sub">
                  {r.cohort > 0 ? `${r.retained}/${r.cohort} users` : 'waiting for cohort'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AUTH + SUPPORT + MONEY */}
        <div className="row-3">
          <div className="panel">
            <div className="panel-head"><h3>Login & Signup</h3></div>
            <div className="stat-pair">
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.auth.loginSuccess ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">login success</div>
              </div>
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.auth.signupSuccess ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">signup success</div>
              </div>
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.auth.loginFailed ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">login failed</div>
              </div>
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.auth.loginPage ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">login page</div>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Support Clicks</h3></div>
            <div className="stat-pair">
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.support.whatsapp ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">WhatsApp</div>
              </div>
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.support.telegram ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">Telegram</div>
              </div>
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.support.liveChat ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">Live chat</div>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Deposits & Withdrawals</h3></div>
            <div className="stat-pair">
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.deposits.attempts ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">deposit requests</div>
                <div className="deposit-amt">
                  {m && m.deposits.attempts > 0
                    ? `${m.deposits.currency} ${m.deposits.total.toLocaleString()}`
                    : 'no deposits yet'}
                </div>
              </div>
              <div className="stat-pair-item">
                <div className="page-visit-num">{(m?.withdrawals.attempts ?? 0).toLocaleString()}</div>
                <div className="page-visit-sub">withdrawal requests</div>
              </div>
            </div>
          </div>
        </div>

        {/* TOP PAGES + PLACEHOLDERS */}
        <div className="row-3">
          <div className="panel">
            <div className="panel-head"><h3>Top Pages</h3></div>
            <SourceList items={m?.topPages ?? []} empty="No page views yet" />
          </div>
          <div className="panel">
            <div className="panel-head"><h3>User by Country</h3></div>
            <div className="empty2"><MapPin size={22} className="empty-icon" />Geo tracking not enabled yet.<br />Requires IP-to-country lookup on ingest.</div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Live Users</h3></div>
            <div className="deposit-box">
              <div className="deposit-num">{m?.liveUsers ?? 0}</div>
              <div className="deposit-lbl">active in last 5 min</div>
            </div>
          </div>
        </div>

        {/* RECENT FEED */}
        <div className="panel">
          <div className="panel-head"><h3>Recent Events</h3><span className="panel-tag live"><Radio size={12} /> Live</span></div>
          <div className="feed2">
            {m && m.recent.length ? (
              m.recent.map((e) => (
                <div className="feed2-row" key={e.id}>
                  <span className="chip2">{e.event_name}</span>
                  <span className="feed2-detail" title={e.summary || e.path || ''}>{e.summary || e.path || '—'}</span>
                  <span className="feed2-time">{timeAgo(e.created_at)}</span>
                </div>
              ))
            ) : (
              <div className="empty2">No events yet — fire some from the SDK (and enable dashboard read access).</div>
            )}
          </div>
        </div>

        <div className="footer-note">
          Analytics via BetTracker SDK → Supabase · Push stats via OneSignal
        </div>
      </main>
    </div>
  );
}

const z = { value: 0, deltaPct: null };
