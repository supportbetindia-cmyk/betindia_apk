// Server-side re-engagement sender. Powers the admin Campaigns page: build the
// segment from an uploaded user list, and send via the 2nd (marketing) Interakt
// account. Import only from route handlers (uses secret keys).

import {
  buildReengagementSegment,
  fetchUsersFromTable,
  DEFAULT_CAMPAIGN_CONFIG,
  type UserInput,
  type Candidate,
  type ReengagementSegment,
} from './reengagement';
import { isCampaignsEnabled } from './settings';
import { getCurrentTenantId } from './tenant';
import { getTenantWhatsApp } from './whatsapp-settings';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERAKT_KEY = process.env.INTERAKT_CAMPAIGN_API_KEY;

// Daily per-audience caps (override via env). Keeps volume sane for deliverability.
const WINBACK_DAILY = Number(process.env.CAMPAIGN_WINBACK_DAILY) || 200;
const FIRST_DEPOSIT_DAILY = Number(process.env.CAMPAIGN_FIRSTDEP_DAILY) || 500;

export type Audience = 'winback' | 'first_deposit';

const TEMPLATES: Record<Audience, { name: string; lang: string }> = {
  winback: { name: process.env.WINBACK_TEMPLATE || 'inactive_users', lang: process.env.WINBACK_LANG || 'en' },
  first_deposit: { name: process.env.FIRST_DEPOSIT_TEMPLATE || 'quick_offer_', lang: process.env.FIRST_DEPOSIT_LANG || 'hi' },
};

export function campaignConfigured(): boolean {
  return Boolean(INTERAKT_KEY);
}

// Which registry account (role) each audience sends from. Register + inactive both
// use the 'retention' account.
const AUDIENCE_ROLE: Record<Audience, string> = { winback: 'retention', first_deposit: 'retention' };
type SendConfig = { apiKey: string | undefined; templateName: string; lang: string };

// Resolve the account key + template for an audience: the retention account if set,
// else the env campaign key + template (so it keeps working before an account exists).
async function resolveSend(audience: Audience): Promise<SendConfig> {
  const acct = await getTenantWhatsApp(AUDIENCE_ROLE[audience]);
  const env = TEMPLATES[audience];
  return {
    apiKey: acct.apiKey || INTERAKT_KEY,
    templateName: acct.templates[audience] || env.name,
    lang: env.lang,
  };
}

export async function winbackConfigured(): Promise<boolean> {
  return Boolean((await resolveSend('winback')).apiKey);
}

export type CampaignLogRow = {
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

/** Recent campaign sends (win-back + first-deposit), filtered by status and/or a
 * user search (matches User_ID or mobile). */
export async function fetchCampaignLog(status = 'all', limit = 200, q = '', tenantId: string = getCurrentTenantId()): Promise<CampaignLogRow[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return [];
  const params = new URLSearchParams({
    select: 'id,user_id,mobile,event_type,template,status,detail,last_error,created_at',
    event_type: 'in.(winback,first_deposit)',
    tenant_id: `eq.${tenantId}`,
    order: 'created_at.desc',
    limit: String(limit),
  });
  if (status && status !== 'all') params.set('status', `eq.${status}`);
  const safe = q.replace(/[%,()*]/g, '').trim(); // strip PostgREST special chars
  if (safe) params.set('or', `(user_id.ilike.*${safe}*,mobile.ilike.*${safe}*)`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/message_log?${params.toString()}`, { headers: sbHeaders(), cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

export type DaySummary = { date: string; sent: number; failed: number; skipped: number; total: number };

/** Per-day sent/failed/skipped totals for campaign messages over the last N days. */
export async function fetchCampaignSummary(days = 14, tenantId: string = getCurrentTenantId()): Promise<DaySummary[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const params = new URLSearchParams({
    select: 'status,created_at',
    event_type: 'in.(winback,first_deposit)',
    tenant_id: `eq.${tenantId}`,
    created_at: `gte.${since}`,
    order: 'created_at.desc',
    limit: '10000',
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/message_log?${params.toString()}`, { headers: sbHeaders(), cache: 'no-store' });
  if (!res.ok) return [];
  const rows = await res.json() as Array<{ status: string | null; created_at: string }>;
  const byDay = new Map<string, DaySummary>();
  for (const r of rows) {
    const date = r.created_at.slice(0, 10);
    const d = byDay.get(date) ?? { date, sent: 0, failed: 0, skipped: 0, total: 0 };
    d.total++;
    if (r.status === 'sent') d.sent++;
    else if (r.status === 'failed') d.failed++;
    else d.skipped++;
    byDay.set(date, d);
  }
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function previewCampaign(users: UserInput[]): Promise<ReengagementSegment> {
  return buildReengagementSegment(users, DEFAULT_CAMPAIGN_CONFIG);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: SERVICE_ROLE ?? '', Authorization: `Bearer ${SERVICE_ROLE}`, ...extra };
}

/** Insert a log row; false = already logged today (dedupe). */
async function claimLog(row: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/message_log?on_conflict=event_key`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify({ tenant_id: getCurrentTenantId(), ...row }),
  });
  if (!res.ok) throw new Error(`log insert ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return (await res.json() as unknown[]).length > 0;
}

async function updateLog(eventKey: string, patch: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/message_log?event_key=eq.${encodeURIComponent(eventKey)}`, {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  }).catch(() => {});
}

async function sendInterakt(c: Candidate, cfg: SendConfig): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch('https://api.interakt.ai/v1/public/message/', {
    method: 'POST',
    headers: { Authorization: `Basic ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      countryCode: '+91',
      phoneNumber: String(c.mobile).replace(/\D/g, '').slice(-10),
      type: 'Template',
      template: { name: cfg.templateName, languageCode: cfg.lang, bodyValues: [c.name || 'there'] },
    }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok && j?.result !== false, id: j?.id, error: j?.message || (res.ok ? undefined : `HTTP ${res.status}`) };
}

export type SendResult = {
  audience: Audience;
  eligible: number;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
};

/** Send WhatsApp templates to a ready pool of candidates (capped at `limit`). */
async function sendCandidates(pool: Candidate[], limit: number): Promise<SendResult> {
  const batch = pool.slice(0, limit);
  const audience: Audience = pool[0]?.audience ?? 'winback';
  const cfg = await resolveSend(audience);
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0, failed = 0, skipped = 0;

  for (const c of batch) {
    const eventKey = `${c.audience}:${c.user_id}:${today}`;
    let claimed: boolean;
    try {
      claimed = await claimLog({
        event_key: eventKey, channel: 'whatsapp', template: cfg.templateName,
        event_type: c.audience, user_id: c.user_id, mobile: c.mobile,
        status: 'processing', detail: 'campaign send',
      });
    } catch { failed++; continue; }
    if (!claimed) { skipped++; continue; }

    const r = await sendInterakt(c, cfg);
    await updateLog(eventKey, r.ok
      ? { status: 'sent', detail: `campaign ${c.audience}` }
      : { status: 'failed', detail: 'campaign send failed', last_error: r.error ?? 'send failed' });
    if (r.ok) sent++; else failed++;
    await sleep(250);
  }

  return { audience, eligible: pool.length, attempted: batch.length, sent, failed, skipped };
}

/** Send a campaign to up to `limit` users of one audience. */
export async function sendCampaign(users: UserInput[], audience: Audience, limit: number): Promise<SendResult> {
  if (!INTERAKT_KEY) throw new Error('INTERAKT_CAMPAIGN_API_KEY is not set on the server');
  const seg = await buildReengagementSegment(users, DEFAULT_CAMPAIGN_CONFIG);
  const pool = audience === 'first_deposit' ? seg.firstDeposit : seg.winback;
  return sendCandidates(pool, limit);
}

// ---------------------------------------------------------------------------
// Dormant DEPOSITOR win-back — uses the CRM report (users table) as the source
// of truth for "who has ever deposited", combined with transaction recency, so
// it catches depositors the webhook never saw.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

export type DormantConfig = { inactiveDays: number; maxInactiveDays: number; cooldownDays: number };
export const DEFAULT_DORMANT_CONFIG: DormantConfig = {
  inactiveDays: Number(process.env.DORMANT_INACTIVE_DAYS) || 30,
  maxInactiveDays: Number(process.env.DORMANT_MAX_INACTIVE_DAYS) || 0, // 0 = no upper limit
  cooldownDays: Number(process.env.DORMANT_COOLDOWN_DAYS) || 14,
};

function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((now - t) / DAY);
}

async function fetchAll<T>(pathAndQuery: string): Promise<T[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const pageSize = 1000;
  const all: T[] = [];
  for (let off = 0; ; off += pageSize) {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}${sep}limit=${pageSize}&offset=${off}`, { headers: sbHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(`read ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const page = await res.json() as T[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

async function fetchWinbackCooldown(cooldownDays: number): Promise<Set<string>> {
  const since = new Date(Date.now() - cooldownDays * DAY).toISOString();
  const rows = await fetchAll<{ user_id: string | null }>(
    `message_log?select=user_id&event_type=in.(winback,first_deposit)&status=eq.sent&created_at=gte.${since}`,
  );
  return new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)));
}

async function fetchTxnRecency(): Promise<Map<string, { last: string; deposits: number }>> {
  const rows = await fetchAll<{ user_id: string | null; type: string | null; created_at: string }>('transactions?select=user_id,type,created_at');
  const m = new Map<string, { last: string; deposits: number }>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const cur = m.get(r.user_id);
    if (!cur) m.set(r.user_id, { last: r.created_at, deposits: r.type === 'deposit' ? 1 : 0 });
    else { if (new Date(r.created_at) > new Date(cur.last)) cur.last = r.created_at; if (r.type === 'deposit') cur.deposits++; }
  }
  return m;
}

type DormantUserRow = {
  user_id: string; mobile: string | null; name: string | null; language: string | null;
  deposit_count: number | null; last_deposit_date: string | null; last_withdrawal_date: string | null;
};

export type DormantCounts = { depositors: number; dormant: number; skippedNoMobile: number; skippedCooldown: number; eligible: number };

/** Depositors (report OR webhook) silent >= inactiveDays and outside the cooldown. */
export async function fetchDormantDepositors(config: DormantConfig = DEFAULT_DORMANT_CONFIG, now = Date.now()): Promise<{ candidates: Candidate[]; counts: DormantCounts }> {
  const [users, txn, cooldown] = await Promise.all([
    fetchAll<DormantUserRow>('users?select=user_id,mobile,name,language,deposit_count,last_deposit_date,last_withdrawal_date'),
    fetchTxnRecency(),
    fetchWinbackCooldown(config.cooldownDays),
  ]);

  const candidates: Candidate[] = [];
  const counts: DormantCounts = { depositors: 0, dormant: 0, skippedNoMobile: 0, skippedCooldown: 0, eligible: 0 };

  for (const u of users) {
    const agg = txn.get(u.user_id);
    const depositor = (u.deposit_count ?? 0) > 0 || (agg?.deposits ?? 0) > 0;
    if (!depositor) continue;
    counts.depositors++;

    const lastActivity = [u.last_deposit_date, u.last_withdrawal_date, agg?.last]
      .filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
    const days = daysSince(lastActivity, now);
    if (days === null || days < config.inactiveDays) continue;
    if (config.maxInactiveDays > 0 && days > config.maxInactiveDays) continue;
    counts.dormant++;

    if (!u.mobile) { counts.skippedNoMobile++; continue; }
    if (cooldown.has(u.user_id)) { counts.skippedCooldown++; continue; }

    candidates.push({ user_id: u.user_id, mobile: u.mobile, name: u.name, language: u.language, audience: 'winback', inactiveDays: days, bonus: 0 });
  }
  counts.eligible = candidates.length;
  return { candidates, counts };
}

/** Send the win-back template to dormant depositors (capped at `limit`). */
export async function sendDormantWinback(limit = WINBACK_DAILY, config: DormantConfig = DEFAULT_DORMANT_CONFIG): Promise<SendResult & { counts: DormantCounts }> {
  if (!(await winbackConfigured())) throw new Error('No WhatsApp key for winback — set the retention account or INTERAKT_CAMPAIGN_API_KEY');
  const { candidates, counts } = await fetchDormantDepositors(config);
  const result = await sendCandidates(candidates, limit);
  return { ...result, counts };
}

export type DailyCampaignResult = {
  ran: boolean;
  reason?: string;
  winback?: SendResult;
  firstDeposit?: SendResult;
};

/** Daily cron entry point. Gated by the campaigns toggle; reads the user list from
 * the DB (so it needs no file/browser); sends a capped batch of BOTH audiences.
 * Cooldown + dedupe are handled inside sendCampaign, so daily re-runs are safe. */
export async function runDailyCampaigns(): Promise<DailyCampaignResult> {
  if (!(await isCampaignsEnabled())) return { ran: false, reason: 'campaigns disabled' };
  if (!campaignConfigured()) return { ran: false, reason: 'INTERAKT_CAMPAIGN_API_KEY not set' };

  const users = await fetchUsersFromTable();
  if (users.length === 0) return { ran: false, reason: 'no users in the users table' };

  // Win-back targets dormant DEPOSITORS from the CRM report + webhook (source of
  // truth), so it reaches everyone who ever deposited — not just webhook-era lapses.
  const winback = await sendDormantWinback(WINBACK_DAILY);
  // "Other users": registered but never deposited -> first-deposit nudge.
  const firstDeposit = await sendCampaign(users, 'first_deposit', FIRST_DEPOSIT_DAILY);
  return { ran: true, winback, firstDeposit };
}

/** Persist an uploaded user list into the `users` table (idempotent upsert). */
export async function importUsers(users: UserInput[]): Promise<number> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  let count = 0;
  for (let i = 0; i < users.length; i += 500) {
    const tenant = getCurrentTenantId();
    const batch = users.slice(i, i + 500).map((u) => ({
      user_id: u.user_id,
      branch_id: u.branch_id ?? null,
      mobile: u.mobile ?? null,
      name: u.name ?? null,
      language: u.language ?? null,
      register_date: u.register_date ?? null,
      tenant_id: tenant,
      updated_at: new Date().toISOString(),
    }));
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=user_id`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`users upsert ${res.status}: ${(await res.text()).slice(0, 150)}`);
    count += batch.length;
  }
  return count;
}

/** Send BOTH audiences (win-back + first-deposit) in capped batches. */
export async function sendBoth(users: UserInput[]): Promise<DailyCampaignResult> {
  if (!campaignConfigured()) return { ran: false, reason: 'INTERAKT_CAMPAIGN_API_KEY not set' };
  const winback = await sendCampaign(users, 'winback', WINBACK_DAILY);
  const firstDeposit = await sendCampaign(users, 'first_deposit', FIRST_DEPOSIT_DAILY);
  return { ran: true, winback, firstDeposit };
}
