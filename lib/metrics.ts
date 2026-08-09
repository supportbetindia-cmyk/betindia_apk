import type { AnalyticsEvent } from './supabase';
import { resolveDateRange, type DateRangeKey, type ResolvedDateRange } from './date-range.ts';

export type Count = { label: string; value: number };
export type FunnelStep = { label: string; users: number; pct: number; dropPct: number };
export type Slice = { label: string; value: number; color: string };
export type DayPoint = { label: string; value: number };
export type Kpi = { value: number; deltaPct: number | null };

export type RecentEvent = {
  id: number;
  event_name: string;
  created_at: string;
  path: string | null;
  summary: string;
};

export type RetentionPoint = {
  label: string;
  day: number;
  rate: number;
  cohort: number;
  retained: number;
};

export type Metrics = {
  generatedAt: string;
  range: {
    key: DateRangeKey;
    label: string;
    comparisonLabel: string;
    from: string | null;
    to: string;
  };
  kpis: {
    installs: Kpi;
    activeUsers: Kpi;
    newUsers: Kpi;
    sessions: Kpi;
    avgSessionSec: Kpi;
    retentionD7: Kpi;
  };
  identity: {
    /** Unique anonymous SDK device ids ever observed in loaded history. */
    knownDevices: number;
    /** Devices with an explicit one-time install event. */
    verifiedInstalls: number;
    /** Stable platform account ids attached by BetTracker.identify(). */
    identifiedUsers: number;
    /** Identified accounts with at least one event in the selected range. */
    activeIdentifiedUsers: number;
    /** Active devices that did not provide a platform account id. */
    anonymousActiveDevices: number;
    /** Share of active devices linked to an account in the selected range. */
    coveragePct: number;
  };
  liveUsers: number;
  installsSeries: DayPoint[];
  activeSeries: DayPoint[];
  trafficSources: Count[];
  audience: Slice[];
  devices: Slice[];
  platforms: Slice[];
  countries: Count[];
  eventsByName: Count[];
  topPages: Count[];
  /** Named product-page visits (casino / cricket / tennis / …). */
  pageVisits: Count[];
  deposits: { attempts: number; total: number; currency: string };
  withdrawals: { attempts: number };
  support: { whatsapp: number; telegram: number; liveChat: number };
  auth: {
    loginPage: number;
    signupPage: number;
    loginSuccess: number;
    loginFailed: number;
    signupSuccess: number;
  };
  /** Classic cohort retention: % of install cohort active on day N. */
  retention: RetentionPoint[];
  activity: {
    dau: number; wau: number; mau: number; stickiness: number;
    active3d: number; active7d: number; inactive7to30: number; inactive30plus: number;
  };
  funnel: FunnelStep[];
  recent: RecentEvent[];
  coverage: { trafficSources: boolean; countries: boolean };
};

/** Route-event names → display labels. Always shown on the dashboard. */
const PAGE_VISIT_EVENTS: Array<{ event: string; label: string }> = [
  { event: 'casino_page', label: 'Casino' },
  { event: 'cricket_page', label: 'Cricket' },
  { event: 'tennis_page', label: 'Tennis' },
  { event: 'football_page', label: 'Football' },
  { event: 'live_sports_page', label: 'Live Sports' },
  { event: 'live_casino_page', label: 'Live Casino' },
  { event: 'aviator_page', label: 'Aviator' },
  { event: 'slots_page', label: 'Slots' },
  { event: 'roulette_page', label: 'Roulette' },
  { event: 'teen_patti_page', label: 'Teen Patti' },
  { event: 'andar_bahar_page', label: 'Andar Bahar' },
  { event: 'blackjack_page', label: 'Blackjack' },
  { event: 'deposit_page', label: 'Deposit' },
  { event: 'withdrawal_page', label: 'Withdrawal' },
  { event: 'login_page', label: 'Login' },
  { event: 'signup_page', label: 'Signup' },
];

function isInstallEvent(name: string): boolean {
  return name === 'install';
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}


export function cohortRetention(
  firstSeen: Map<string, number>,
  activeDays: Map<string, Set<number>>,
  dayOffset: number,
  nowMs: number = Date.now()
): { rate: number; cohort: number; retained: number } {
  let cohort = 0;
  let retained = 0;
  for (const [device, first] of firstSeen) {
    const installDay = startOfUtcDay(first);
    const targetDay = installDay + dayOffset * DAY;
    // Day N must be fully in the past to count.
    if (targetDay + DAY > nowMs) continue;
    cohort++;
    if (activeDays.get(device)?.has(targetDay)) retained++;
  }
  const rate = cohort ? Math.round((retained / cohort) * 1000) / 10 : 0;
  return { rate, cohort, retained };
}

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const PALETTE = ['#7c6cf6', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#94a3b8'];

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const ts = (e: AnalyticsEvent) => new Date(e.created_at).getTime();

function pathOf(e: AnalyticsEvent): string | null {
  const page = asObj(asObj(e.context).page);
  const props = asObj(e.properties);
  return (
    (props.path as string) ||
    (page.path as string) ||
    (props.url as string) ||
    (page.url as string) ||
    null
  );
}

function userIdOf(e: AnalyticsEvent): string | null {
  const props = asObj(e.properties);
  const value = props.user_id ?? props.userId ?? props.username;
  if (value === undefined || value === null) return null;
  const userId = String(value).trim();
  return userId || null;
}

function deviceType(e: AnalyticsEvent): 'Android' | 'iOS' | 'Web' {
  const ua = String(asObj(e.context).user_agent ?? '');
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod|ios/i.test(ua)) return 'iOS';
  return 'Web';
}

function trafficSource(e: AnalyticsEvent): string {
  const ctx = asObj(e.context);
  const utm = asObj(ctx.utm);
  if (typeof utm.source === 'string' && utm.source) return utm.source;
  const ref = String(ctx.referrer ?? '');
  if (!ref) return 'Direct';
  try {
    return new URL(ref).hostname.replace(/^www\./, '');
  } catch {
    return 'Direct';
  }
}

function summarize(e: AnalyticsEvent): string {
  const props = asObj(e.properties);
  const keys = Object.keys(props);
  if (keys.length === 0) return '';
  if (typeof props.text === 'string' && props.text) return `"${props.text}"`;
  return keys.slice(0, 3).map((k) => `${k}=${JSON.stringify(props[k])}`).join('  ');
}

function topCounts(map: Map<string, number>, limit: number): Count[] {
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, limit);
}

function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

/** Metrics for a single time window. */
function windowStats(events: AnalyticsEvent[], from: number, to: number) {
  const inWin = events.filter((e) => {
    const t = ts(e);
    return t >= from && t < to;
  });
  const devices = new Set<string>();
  const sessions = new Set<string>();
  const sessionBounds = new Map<string, { min: number; max: number }>();
  const installDevices = new Set<string>();

  for (const e of inWin) {
    if (e.device_id) devices.add(e.device_id);
    if (e.session_id) {
      sessions.add(e.session_id);
      const b = sessionBounds.get(e.session_id);
      const t = ts(e);
      if (!b) sessionBounds.set(e.session_id, { min: t, max: t });
      else sessionBounds.set(e.session_id, { min: Math.min(b.min, t), max: Math.max(b.max, t) });
    }
    if (isInstallEvent(e.event_name) && e.device_id) installDevices.add(e.device_id);
  }

  let avgSessionSec = 0;
  if (sessionBounds.size) {
    let total = 0;
    for (const b of sessionBounds.values()) total += (b.max - b.min) / 1000;
    avgSessionSec = Math.round(total / sessionBounds.size);
  }

  return { installs: installDevices.size, activeUsers: devices.size, sessions: sessions.size, avgSessionSec, devices };
}

export type MetricsOptions = {
  rangeKey?: DateRangeKey;
  nowMs?: number;
};

function eventsInWindow(events: AnalyticsEvent[], from: number | null, to: number): AnalyticsEvent[] {
  return events.filter((event) => {
    const time = ts(event);
    return (from === null || time >= from) && time < to;
  });
}

function seriesForRange(
  events: AnalyticsEvent[],
  firstSeen: Map<string, number>,
  range: ResolvedDateRange
): { installs: DayPoint[]; active: DayPoint[] } {
  if (events.length === 0) return { installs: [], active: [] };

  const earliest = Math.min(...events.map(ts));
  const from = range.from ?? earliest;
  const duration = Math.max(range.to - from, 1);
  const HOUR = 60 * MIN;
  const bucketMs = range.key === 'today'
    ? HOUR
    : range.key === '7d' || range.key === '30d'
      ? DAY
      : range.key === '90d'
        ? 7 * DAY
        : Math.max(DAY, Math.ceil(duration / 12 / DAY) * DAY);
  const count = Math.max(1, Math.ceil(duration / bucketMs));
  const dayFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
  const hourFmt = new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  const installs: DayPoint[] = [];
  const active: DayPoint[] = [];
  for (let index = 0; index < count; index++) {
    const bucketFrom = from + index * bucketMs;
    const bucketTo = Math.min(range.to, bucketFrom + bucketMs);
    const labelDate = new Date(bucketFrom);
    const label = range.key === 'today' ? hourFmt.format(labelDate) : dayFmt.format(labelDate);
    const bucketEvents = events.filter((event) => {
      const time = ts(event);
      return time >= bucketFrom && time < bucketTo;
    });
    let newInstalls = 0;
    for (const time of firstSeen.values()) {
      if (time >= bucketFrom && time < bucketTo) newInstalls++;
    }
    installs.push({ label, value: newInstalls });
    active.push({
      label,
      value: new Set(bucketEvents.map((event) => event.device_id).filter(Boolean)).size,
    });
  }
  return { installs, active };
}

export function computeMetrics(events: AnalyticsEvent[], options: MetricsOptions = {}): Metrics {
  const now = options.nowMs ?? Date.now();
  const range = resolveDateRange(options.rangeKey ?? '7d', now);
  const currentEvents = eventsInWindow(events, range.from, range.to);
  const previousEvents = range.previousFrom === null || range.previousTo === null
    ? []
    : eventsInWindow(events, range.previousFrom, range.previousTo);
  const cur = windowStats(currentEvents, range.from ?? Number.NEGATIVE_INFINITY, range.to);
  const prev = range.previousFrom === null || range.previousTo === null
    ? null
    : windowStats(previousEvents, range.previousFrom, range.previousTo);

  // First-seen per device across the history loaded for this range.
  const firstSeen = new Map<string, number>();
  for (const e of events) {
    if (!e.device_id) continue;
    const t = ts(e);
    const existing = firstSeen.get(e.device_id);
    if (existing === undefined || t < existing) firstSeen.set(e.device_id, t);
  }
  const installSeen = new Map<string, number>();
  for (const event of events) {
    if (!event.device_id || !isInstallEvent(event.event_name)) continue;
    const time = ts(event);
    const existing = installSeen.get(event.device_id);
    if (existing === undefined || time < existing) installSeen.set(event.device_id, time);
  }
  // "New device" means first observed SDK activity. Keep this definition
  // stable even after explicit install events begin arriving, otherwise older
  // devices would disappear from the trend as soon as the first install lands.
  const newUserTimes = firstSeen;

  // Account-based metrics are deliberately separate from anonymous devices.
  // A user is counted only when the host app provides a stable account id.
  const identifiedUsers = new Set<string>();
  const activeIdentifiedUsers = new Set<string>();
  const identifiedActiveDevices = new Set<string>();
  for (const event of events) {
    const userId = userIdOf(event);
    if (userId) identifiedUsers.add(userId);
  }
  for (const event of currentEvents) {
    const userId = userIdOf(event);
    if (!userId) continue;
    activeIdentifiedUsers.add(userId);
    if (event.device_id) identifiedActiveDevices.add(event.device_id);
  }
  const anonymousActiveDevices = Math.max(0, cur.activeUsers - identifiedActiveDevices.size);
  const identityCoveragePct = cur.activeUsers
    ? Math.round((identifiedActiveDevices.size / cur.activeUsers) * 1000) / 10
    : 0;
  const countUsersIn = (from: number | null, to: number | null) => {
    if (to === null) return 0;
    let count = 0;
    for (const time of newUserTimes.values()) {
      if ((from === null || time >= from) && time < to) count++;
    }
    return count;
  };
  const newUsersCur = countUsersIn(range.from, range.to);
  const newUsersPrev = countUsersIn(range.previousFrom, range.previousTo);

  // Last-seen per device → activity/inactivity buckets (unique users).
  const lastSeen = new Map<string, number>();
  for (const e of events) {
    if (!e.device_id) continue;
    const t = ts(e);
    const existing = lastSeen.get(e.device_id);
    if (existing === undefined || t > existing) lastSeen.set(e.device_id, t);
  }
  const activity = {
    dau: 0, wau: 0, mau: 0, stickiness: 0,
    active3d: 0, active7d: 0, inactive7to30: 0, inactive30plus: 0,
  };
  for (const t of lastSeen.values()) {
    const ageDays = (now - t) / DAY;
    if (ageDays <= 1) activity.dau++; // daily active
    if (ageDays <= 7) activity.wau++; // weekly active
    if (ageDays <= 30) activity.mau++; // monthly active
    if (ageDays <= 3) activity.active3d++;
    if (ageDays <= 7) activity.active7d++;
    else if (ageDays <= 30) activity.inactive7to30++;
    else activity.inactive30plus++;
  }
  // Stickiness = DAU/MAU: what share of monthly users show up daily.
  activity.stickiness = activity.mau ? Math.round((activity.dau / activity.mau) * 1000) / 10 : 0;

  // Conversion funnel: unique devices that reached each stage. A stage can be
  // satisfied by any of several events (e.g. signup OR login).
  const eventDevices = new Map<string, Set<string>>();
  for (const e of currentEvents) {
    if (!e.device_id) continue;
    let set = eventDevices.get(e.event_name);
    if (!set) {
      set = new Set();
      eventDevices.set(e.event_name, set);
    }
    set.add(e.device_id);
  }
  const funnelStages: Array<{ label: string; events: string[] }> = [
    { label: 'App Opened', events: ['app_open'] },
    { label: 'Signup / Login', events: ['signup_page', 'login_page'] },
    { label: 'Deposit Page', events: ['deposit_page'] },
    { label: 'Deposit Submitted', events: ['deposit_submit'] },
  ];
  const stageUsers = funnelStages.map((stage) => {
    const s = new Set<string>();
    for (const ev of stage.events) {
      const set = eventDevices.get(ev);
      if (set) for (const d of set) s.add(d);
    }
    return { label: stage.label, users: s.size };
  });
  const funnelTop = stageUsers[0]?.users || 1;
  const funnel: FunnelStep[] = stageUsers.map((s, i) => ({
    label: s.label,
    users: s.users,
    pct: Math.round((s.users / funnelTop) * 1000) / 10,
    dropPct:
      i === 0 || stageUsers[i - 1].users === 0
        ? 0
        : Math.round((1 - s.users / stageUsers[i - 1].users) * 1000) / 10,
  }));

  // Active calendar days per device (UTC) for cohort retention.
  const activeDays = new Map<string, Set<number>>();
  for (const e of events) {
    if (!e.device_id) continue;
    const day = startOfUtcDay(ts(e));
    let set = activeDays.get(e.device_id);
    if (!set) {
      set = new Set();
      activeDays.set(e.device_id, set);
    }
    set.add(day);
  }
  const d1 = cohortRetention(firstSeen, activeDays, 1, now);
  const d7 = cohortRetention(firstSeen, activeDays, 7, now);
  const d30 = cohortRetention(firstSeen, activeDays, 30, now);
  const retention: RetentionPoint[] = [
    { label: 'D1', day: 1, rate: d1.rate, cohort: d1.cohort, retained: d1.retained },
    { label: 'D7', day: 7, rate: d7.rate, cohort: d7.cohort, retained: d7.retained },
    { label: 'D30', day: 30, rate: d30.rate, cohort: d30.cohort, retained: d30.retained },
  ];

  const series = seriesForRange(currentEvents, newUserTimes, range);
  const installsSeries = series.installs;
  const activeSeries = series.active;

  // Breakdowns within the selected reporting window.
  const byName = new Map<string, number>();
  const pageCounts = new Map<string, number>();
  const pageVisitCounts = new Map<string, number>();
  // Unique devices per device-type (NOT event count) so 1 phone = 1 user.
  const deviceSets = new Map<string, Set<string>>();
  // Unique devices per platform (app vs web).
  const platformSets = new Map<string, Set<string>>();
  // Acquisition source per device (from its earliest event) so we count
  // unique USERS per source, not raw events.
  const deviceFirstSource = new Map<string, { t: number; src: string }>();
  const liveSessions = new Set<string>();
  const allDevices = new Set<string>();
  const returningDevices = new Set<string>();
  let hasReferrerData = false;
  let depositAttempts = 0;
  let depositTotal = 0;
  let depositCurrency = 'INR';
  let withdrawalAttempts = 0;
  let whatsappClicks = 0;
  let telegramClicks = 0;
  let liveChatOpens = 0;
  let loginPage = 0;
  let signupPage = 0;
  let loginSuccess = 0;
  let loginFailed = 0;
  let signupSuccess = 0;

  for (const e of currentEvents) {
    byName.set(e.event_name, (byName.get(e.event_name) ?? 0) + 1);
    if (e.device_id) allDevices.add(e.device_id);
    if (e.session_id && now - ts(e) <= 5 * MIN) liveSessions.add(e.session_id);

    if (e.device_id) {
      const dt = deviceType(e);
      let set = deviceSets.get(dt);
      if (!set) {
        set = new Set();
        deviceSets.set(dt, set);
      }
      set.add(e.device_id);

      const plat = String(asObj(e.context).platform ?? 'unknown');
      let pset = platformSets.get(plat);
      if (!pset) {
        pset = new Set();
        platformSets.set(plat, pset);
      }
      pset.add(e.device_id);
    }

    const ctx = asObj(e.context);
    if (ctx.referrer !== undefined || ctx.utm !== undefined) hasReferrerData = true;
    if (e.device_id) {
      const src = trafficSource(e);
      const t = ts(e);
      const prev = deviceFirstSource.get(e.device_id);
      if (!prev || t < prev.t) deviceFirstSource.set(e.device_id, { t, src });
    }

    if (e.event_name === 'page_view') {
      const p = pathOf(e);
      if (p) pageCounts.set(p, (pageCounts.get(p) ?? 0) + 1);
    }
    if (PAGE_VISIT_EVENTS.some((p) => p.event === e.event_name)) {
      pageVisitCounts.set(e.event_name, (pageVisitCounts.get(e.event_name) ?? 0) + 1);
    }
    if (e.event_name === 'deposit_submit') {
      depositAttempts++;
      const props = asObj(e.properties);
      const amount = Number(props.amount);
      if (Number.isFinite(amount)) depositTotal += amount;
      if (typeof props.currency === 'string') depositCurrency = props.currency;
    }
    if (e.event_name === 'withdrawal_submit') withdrawalAttempts++;
    if (e.event_name === 'whatsapp_click') whatsappClicks++;
    if (e.event_name === 'telegram_click') telegramClicks++;
    if (e.event_name === 'live_chat_open') liveChatOpens++;
    if (e.event_name === 'login_page') loginPage++;
    if (e.event_name === 'signup_page') signupPage++;
    if (e.event_name === 'login_success') loginSuccess++;
    if (e.event_name === 'login_failed') loginFailed++;
    if (e.event_name === 'signup_success') signupSuccess++;
  }

  // Featured games always listed; other product pages only when visited.
  const featuredEvents = [
    'casino_page',
    'cricket_page',
    'tennis_page',
    'football_page',
    'aviator_page',
    'live_casino_page',
  ];
  const pageVisits: Count[] = [
    ...featuredEvents.map((event) => {
      const meta = PAGE_VISIT_EVENTS.find((p) => p.event === event)!;
      return { label: meta.label, value: pageVisitCounts.get(event) ?? 0 };
    }),
    ...PAGE_VISIT_EVENTS.filter(
      (p) => !featuredEvents.includes(p.event) && (pageVisitCounts.get(p.event) ?? 0) > 0
    )
      .map((p) => ({ label: p.label, value: pageVisitCounts.get(p.event) ?? 0 }))
      .sort((a, b) => b.value - a.value),
  ];
  for (const [d, t] of firstSeen) if (t < now - DAY && allDevices.has(d)) returningDevices.add(d);

  // Unique users per acquisition source (each user counted once, by first source).
  const sourceCounts = new Map<string, number>();
  for (const { src } of deviceFirstSource.values()) {
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }

  const platformMeta: Record<string, { label: string; color: string }> = {
    app: { label: 'Mobile App', color: '#7c6cf6' },
    web: { label: 'Website', color: '#22c55e' },
    unknown: { label: 'Unknown', color: '#94a3b8' },
  };
  const platforms: Slice[] = [...platformSets.entries()]
    .map(([key, set]) => ({
      label: platformMeta[key]?.label ?? key,
      value: set.size,
      color: platformMeta[key]?.color ?? '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);

  const deviceColors: Record<string, string> = { Android: '#22c55e', iOS: '#3b82f6', Web: '#f59e0b' };
  const devices: Slice[] = [...deviceSets.entries()]
    .map(([label, set]) => ({ label, value: set.size, color: deviceColors[label] ?? '#94a3b8' }))
    .sort((a, b) => b.value - a.value);

  const newTotal = newUsersCur;
  const returningTotal = allDevices.size - newTotal;
  const audience: Slice[] = [
    { label: 'New Users', value: Math.max(0, newTotal), color: PALETTE[0] },
    { label: 'Returning', value: Math.max(0, returningTotal), color: PALETTE[1] },
  ];

  const recent: RecentEvent[] = currentEvents.slice(0, 30).map((e) => ({
    id: e.id,
    event_name: e.event_name,
    created_at: e.created_at,
    path: pathOf(e),
    summary: summarize(e),
  }));

  return {
    generatedAt: new Date(now).toISOString(),
    range: {
      key: range.key,
      label: range.label,
      comparisonLabel: range.comparisonLabel,
      from: range.from === null ? null : new Date(range.from).toISOString(),
      to: new Date(range.to).toISOString(),
    },
    kpis: {
      installs: {
        // Historical dashboard data did not include verified install events,
        // so this KPI is intentionally "Known Devices" (first SDK activity).
        // Explicit installs are reported separately in identity.
        value: firstSeen.size,
        deltaPct: prev ? deltaPct(newUsersCur, newUsersPrev) : null,
      },
      activeUsers: {
        value: cur.activeUsers,
        deltaPct: prev ? deltaPct(cur.activeUsers, prev.activeUsers) : null,
      },
      newUsers: { value: newUsersCur, deltaPct: prev ? deltaPct(newUsersCur, newUsersPrev) : null },
      sessions: { value: cur.sessions, deltaPct: prev ? deltaPct(cur.sessions, prev.sessions) : null },
      avgSessionSec: {
        value: cur.avgSessionSec,
        deltaPct: prev ? deltaPct(cur.avgSessionSec, prev.avgSessionSec) : null,
      },
      retentionD7: { value: d7.rate, deltaPct: null },
    },
    identity: {
      knownDevices: firstSeen.size,
      verifiedInstalls: installSeen.size,
      identifiedUsers: identifiedUsers.size,
      activeIdentifiedUsers: activeIdentifiedUsers.size,
      anonymousActiveDevices,
      coveragePct: identityCoveragePct,
    },
    liveUsers: liveSessions.size,
    installsSeries,
    activeSeries,
    trafficSources: topCounts(sourceCounts, 7),
    audience,
    devices,
    platforms,
    countries: [],
    eventsByName: topCounts(byName, 10),
    topPages: topCounts(pageCounts, 8),
    pageVisits,
    deposits: { attempts: depositAttempts, total: depositTotal, currency: depositCurrency },
    withdrawals: { attempts: withdrawalAttempts },
    support: { whatsapp: whatsappClicks, telegram: telegramClicks, liveChat: liveChatOpens },
    auth: { loginPage, signupPage, loginSuccess, loginFailed, signupSuccess },
    retention,
    recent,
    activity,
    funnel,
    coverage: { trafficSources: hasReferrerData, countries: false },
  };
}
