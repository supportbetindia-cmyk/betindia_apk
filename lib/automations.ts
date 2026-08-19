import { sendWhatsAppTemplate } from './interakt';
import { isAutomationEnabled, getCronLastRun } from './settings';
import {
  buildAutomationMessage,
  describeSkippedMessage,
  type TransactionAutomationType,
} from './automation-message';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_MAX_ATTEMPTS = 5;

type QueueStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'skipped';

type QueueRow = {
  id: number;
  event_key: string;
  template: string;
  event_type: TransactionAutomationType;
  transaction_id: string | null;
  transaction_status: string | null;
  mobile: string;
  user_id: string | null;
  payload: { countryCode?: string; bodyValues?: unknown } | null;
  status: QueueStatus;
  attempt_count: number;
};

function supabaseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!SERVICE_ROLE) return extra;
  return {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    ...extra,
  };
}

function requireSupabase(): { url: string; key: string } {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  return { url: SUPABASE_URL, key: SERVICE_ROLE };
}


/** Insert one message_log row, ignoring duplicates on event_key. Returns whether
 * a new row was actually created (false = duplicate webhook, already logged). */
async function insertMessageRow(url: string, row: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${url}/rest/v1/message_log?on_conflict=event_key`, {
    method: 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    }),
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    throw new Error(`Automation queue insert failed ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const rows = await response.json() as unknown[];
  return rows.length > 0;
}

/** Persist an automation event before acknowledging the payment webhook. A
 * transaction that can't be messaged (e.g. no valid phone) is still recorded as
 * "skipped" so a dropped message is never invisible. */
export async function queueTransactionAutomation(
  type: TransactionAutomationType,
  body: Record<string, unknown>
): Promise<{ accepted: boolean; duplicate: boolean; skipped: boolean }> {
  const { url } = requireSupabase();
  const message = buildAutomationMessage(type, body);

  if (!message) {
    const skip = describeSkippedMessage(type, body, 'no_valid_phone');
    await insertMessageRow(url, {
      event_key: skip.eventKey,
      channel: 'whatsapp',
      template: skip.templateName,
      event_type: skip.type,
      transaction_id: skip.transactionId || null,
      transaction_status: skip.transactionStatus || null,
      mobile: skip.mobile,
      user_id: skip.userId || null,
      payload: {},
      status: 'skipped',
      detail: 'No valid phone number on this transaction',
    });
    return { accepted: false, duplicate: false, skipped: true };
  }

  const enabled = await isAutomationEnabled(type);
  const inserted = await insertMessageRow(url, {
    event_key: message.eventKey,
    channel: 'whatsapp',
    template: message.templateName,
    event_type: message.type,
    transaction_id: message.transactionId || null,
    transaction_status: message.transactionStatus || null,
    mobile: message.mobile,
    user_id: message.userId || null,
    payload: {
      countryCode: message.countryCode,
      bodyValues: message.bodyValues,
    },
    status: enabled ? 'queued' : 'skipped',
    detail: enabled ? 'Waiting for delivery' : 'Preview only: automation is disabled',
  });
  return { accepted: inserted, duplicate: !inserted, skipped: !enabled };
}

async function claimMessages(limit: number, maxAttempts: number): Promise<QueueRow[]> {
  const { url } = requireSupabase();
  const response = await fetch(`${url}/rest/v1/rpc/claim_whatsapp_messages`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      p_limit: Math.min(Math.max(1, limit), 50),
      p_max_attempts: Math.max(1, maxAttempts),
      p_lock_seconds: 120,
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Automation queue claim failed ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return await response.json() as QueueRow[];
}

async function updateMessage(id: number, patch: Record<string, unknown>): Promise<void> {
  const { url } = requireSupabase();
  const response = await fetch(`${url}/rest/v1/message_log?id=eq.${id}`, {
    method: 'PATCH',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) {
    throw new Error(`Automation queue update failed ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
}

function bodyValuesFrom(row: QueueRow): string[] {
  return Array.isArray(row.payload?.bodyValues)
    ? row.payload.bodyValues.map((value) => String(value ?? ''))
    : [];
}


export async function processAutomationQueue(options: {
  limit?: number;
  maxAttempts?: number;
} = {}): Promise<{ claimed: number; sent: number; failed: number }> {
  if (!(await isAutomationEnabled())) return { claimed: 0, sent: 0, failed: 0 };
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const rows = await claimMessages(options.limit ?? 10, maxAttempts);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    let result: Awaited<ReturnType<typeof sendWhatsAppTemplate>>;
    try {
      result = await sendWhatsAppTemplate({
        phoneNumber: row.mobile,
        countryCode: row.payload?.countryCode || '+91',
        templateName: row.template,
        languageCode: 'en',
        bodyValues: bodyValuesFrom(row),
      });
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (result.ok) {
      await updateMessage(row.id, {
        status: 'sent',
        detail: `Delivered for status: ${row.transaction_status || 'unknown'}`,
        provider_message_id: result.id ?? null,
        sent_at: new Date().toISOString(),
        locked_until: null,
        last_error: null,
      });
      sent++;
      continue;
    }

    const finalAttempt = row.attempt_count >= maxAttempts;
    const retryMinutes = Math.min(60, 2 ** Math.max(0, row.attempt_count - 1));
    await updateMessage(row.id, {
      status: 'failed',
      detail: finalAttempt
        ? `Delivery stopped after ${row.attempt_count} attempts`
        : `Retry scheduled in ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}`,
      last_error: result.error ?? 'send failed',
      next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
      locked_until: null,
    });
    failed++;
  }

  return { claimed: rows.length, sent, failed };
}

export type QueueHealth = {
  queued: number;
  failed: number;
  oldestQueuedAgeMin: number | null;
  lastCronRun: string | null;
  cronAgeMin: number | null;
  warning: string | null;
};

/** Count rows in one status via PostgREST's exact count header. */
async function countStatus(url: string, status: string): Promise<number> {
  const res = await fetch(`${url}/rest/v1/message_log?status=eq.${status}&select=id&limit=1`, {
    headers: supabaseHeaders({ Prefer: 'count=exact' }),
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const total = res.headers.get('content-range')?.split('/')[1];
  return total && total !== '*' ? Number(total) : 0;
}

async function oldestQueuedAt(url: string): Promise<string | null> {
  const res = await fetch(
    `${url}/rest/v1/message_log?status=eq.queued&select=created_at&order=created_at.asc&limit=1`,
    { headers: supabaseHeaders(), cache: 'no-store' },
  );
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ created_at: string }>;
  return rows[0]?.created_at ?? null;
}

const STALE_MINUTES = 5;

/** Surface a stalled cron / piling backlog so a stopped scheduler is obvious. */
export async function getQueueHealth(): Promise<QueueHealth> {
  const empty: QueueHealth = { queued: 0, failed: 0, oldestQueuedAgeMin: null, lastCronRun: null, cronAgeMin: null, warning: null };
  if (!SUPABASE_URL || !SERVICE_ROLE) return empty;
  const { url } = requireSupabase();

  const [queued, failed, oldest, lastCronRun, enabled] = await Promise.all([
    countStatus(url, 'queued'),
    countStatus(url, 'failed'),
    oldestQueuedAt(url),
    getCronLastRun(),
    isAutomationEnabled(),
  ]);

  const now = Date.now();
  const minsSince = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 60_000) : null);
  const cronAgeMin = minsSince(lastCronRun);
  const oldestQueuedAgeMin = minsSince(oldest);

  let warning: string | null = null;
  if (enabled && queued > 0 && (oldestQueuedAgeMin ?? 0) >= STALE_MINUTES) {
    warning = `${queued} message${queued === 1 ? '' : 's'} have been waiting ${oldestQueuedAgeMin} min without sending — the cron isn't draining the queue. Check your cron-job.org job for /api/cron/automations.`;
  } else if (lastCronRun && (cronAgeMin ?? 0) >= STALE_MINUTES) {
    warning = `The sender cron hasn't run in ${cronAgeMin} min. New messages will pile up until it resumes — check cron-job.org.`;
  } else if (!lastCronRun) {
    warning = 'The sender cron has not run yet. Set up a cron-job.org job hitting /api/cron/automations every minute.';
  }

  return { queued, failed, oldestQueuedAgeMin, lastCronRun, cronAgeMin, warning };
}
