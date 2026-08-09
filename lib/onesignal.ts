// Server-side OneSignal reader. Uses the REST API key (secret), so this must
// only run in route handlers — never import into a client component.
//
// OneSignal changed its auth header from `Basic <key>` to `Key <key>`; we try
// the modern scheme first and fall back so both legacy and new keys work.

const APP_ID = process.env.ONESIGNAL_APP_ID;
const REST_KEY = process.env.ONESIGNAL_REST_API_KEY;
const BASE = 'https://api.onesignal.com';
const PLACEHOLDER = 'your_onesignal_rest_api_key';

export type OsNotification = {
  id: string;
  successful?: number; // delivered
  failed?: number;
  converted?: number; // opened / clicked
  remaining?: number;
  queued_at?: number;
  send_after?: number | null;
  completed_at?: number | null;
  headings?: Record<string, string>;
  contents?: Record<string, string>;
  included_segments?: string[];
};

export type OsApp = { players?: number; messageable_players?: number };

export function osConfigured(): boolean {
  return Boolean(APP_ID && REST_KEY && REST_KEY !== PLACEHOLDER);
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let last: Response | null = null;
  for (const scheme of ['Key', 'Basic']) {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `${scheme} ${REST_KEY}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (res.status !== 401 && res.status !== 403) return res;
    last = res;
  }
  return last as Response;
}

/** Recent notifications (newest first), up to `limit` (OneSignal max 50). */
export async function fetchNotifications(limit = 50): Promise<OsNotification[]> {
  const url = `${BASE}/notifications?app_id=${APP_ID}&limit=${limit}&offset=0`;
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OneSignal notifications ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.notifications ?? []) as OsNotification[];
}

/** App-level stats (subscriber counts). */
export async function fetchApp(): Promise<OsApp | null> {
  const res = await authFetch(`${BASE}/apps/${APP_ID}`);
  if (!res.ok) return null;
  return (await res.json()) as OsApp;
}

/** Available targeting segments (falls back to [] if the plan/key can't list them). */
export async function fetchSegments(): Promise<{ id: string; name: string }[]> {
  try {
    const res = await authFetch(`${BASE}/apps/${APP_ID}/segments`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.segments ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
  } catch {
    return [];
  }
}

export type SendInput = { title: string; message: string; segment: string; url?: string };

/**
 * Create (send) a push notification to a segment. This dispatches to real
 * devices — callers must gate it behind explicit user confirmation.
 * @returns { id, recipients }
 */
export async function createNotification(input: SendInput): Promise<{ id: string; recipients: number | null }> {
  const body: Record<string, unknown> = {
    app_id: APP_ID,
    included_segments: [input.segment],
    headings: { en: input.title },
    contents: { en: input.message },
  };
  if (input.url) body.url = input.url;

  const res = await authFetch(`${BASE}/notifications`, { method: 'POST', body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errs = json?.errors ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
    throw new Error(`OneSignal send failed: ${errs}`);
  }
  return { id: json.id, recipients: json.recipients ?? null };
}

/**
 * Send a push to users who have NOT opened the app in `daysInactive` days.
 * Uses OneSignal's `last_session` filter — OneSignal tracks each device's last
 * session natively, so no analytics linkage is needed. Reaches real devices,
 * so callers (the cron) must be the intended automation.
 * @returns { ok, recipients } — recipients is null / 0 if nobody matched.
 */
export async function sendToInactive(input: {
  daysInactive: number;
  title: string;
  message: string;
  url?: string;
}): Promise<{ ok: boolean; recipients: number | null; error?: string }> {
  if (!osConfigured()) return { ok: false, recipients: null, error: 'OneSignal not configured' };

  const body: Record<string, unknown> = {
    app_id: APP_ID,
    headings: { en: input.title },
    contents: { en: input.message },
    // last_session = hours since the device's last app session.
    filters: [{ field: 'last_session', relation: '>', hours_ago: String(input.daysInactive * 24) }],
  };
  if (input.url) body.url = input.url;

  const res = await authFetch(`${BASE}/notifications`, { method: 'POST', body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // "All included players are not subscribed" just means nobody matched.
    const err = json?.errors ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
    return { ok: false, recipients: 0, error: err };
  }
  return { ok: true, recipients: json.recipients ?? null };
}
