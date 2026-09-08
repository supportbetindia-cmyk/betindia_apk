// Server-side re-engagement sender. Powers the admin Campaigns page: build the
// segment from an uploaded user list, and send via the 2nd (marketing) Interakt
// account. Import only from route handlers (uses secret keys).

import {
  buildReengagementSegment,
  DEFAULT_CAMPAIGN_CONFIG,
  type UserInput,
  type Candidate,
  type ReengagementSegment,
} from './reengagement';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERAKT_KEY = process.env.INTERAKT_CAMPAIGN_API_KEY;

export type Audience = 'winback' | 'first_deposit';

const TEMPLATES: Record<Audience, { name: string; lang: string }> = {
  winback: { name: process.env.WINBACK_TEMPLATE || 'inactive_users', lang: process.env.WINBACK_LANG || 'en' },
  first_deposit: { name: process.env.FIRST_DEPOSIT_TEMPLATE || 'quick_offer_', lang: process.env.FIRST_DEPOSIT_LANG || 'hi' },
};

export function campaignConfigured(): boolean {
  return Boolean(INTERAKT_KEY);
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
export async function fetchCampaignLog(status = 'all', limit = 200, q = ''): Promise<CampaignLogRow[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return [];
  const params = new URLSearchParams({
    select: 'id,user_id,mobile,event_type,template,status,detail,last_error,created_at',
    event_type: 'in.(winback,first_deposit)',
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
export async function fetchCampaignSummary(days = 14): Promise<DaySummary[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const params = new URLSearchParams({
    select: 'status,created_at',
    event_type: 'in.(winback,first_deposit)',
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
    body: JSON.stringify(row),
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

async function sendInterakt(c: Candidate): Promise<{ ok: boolean; id?: string; error?: string }> {
  const tmpl = TEMPLATES[c.audience];
  const res = await fetch('https://api.interakt.ai/v1/public/message/', {
    method: 'POST',
    headers: { Authorization: `Basic ${INTERAKT_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      countryCode: '+91',
      phoneNumber: String(c.mobile).replace(/\D/g, '').slice(-10),
      type: 'Template',
      template: { name: tmpl.name, languageCode: tmpl.lang, bodyValues: [c.name || 'there'] },
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

/** Send a campaign to up to `limit` users of one audience. */
export async function sendCampaign(users: UserInput[], audience: Audience, limit: number): Promise<SendResult> {
  if (!INTERAKT_KEY) throw new Error('INTERAKT_CAMPAIGN_API_KEY is not set on the server');
  const seg = await buildReengagementSegment(users, DEFAULT_CAMPAIGN_CONFIG);
  const pool = audience === 'first_deposit' ? seg.firstDeposit : seg.winback;
  const batch = pool.slice(0, limit);

  const today = new Date().toISOString().slice(0, 10);
  let sent = 0, failed = 0, skipped = 0;

  for (const c of batch) {
    const eventKey = `${c.audience}:${c.user_id}:${today}`;
    let claimed: boolean;
    try {
      claimed = await claimLog({
        event_key: eventKey, channel: 'whatsapp', template: TEMPLATES[c.audience].name,
        event_type: c.audience, user_id: c.user_id, mobile: c.mobile,
        status: 'processing', detail: 'campaign send',
      });
    } catch { failed++; continue; }
    if (!claimed) { skipped++; continue; }

    const r = await sendInterakt(c);
    await updateLog(eventKey, r.ok
      ? { status: 'sent', detail: `campaign ${c.audience}` }
      : { status: 'failed', detail: 'campaign send failed', last_error: r.error ?? 'send failed' });
    if (r.ok) sent++; else failed++;
    await sleep(250);
  }

  return { audience, eligible: pool.length, attempted: batch.length, sent, failed, skipped };
}
