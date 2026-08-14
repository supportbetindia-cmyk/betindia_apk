import { sendWhatsAppTemplate } from './interakt';
import {
  buildAutomationMessage,
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

export function automationEnabled(): boolean {
  return process.env.AUTOMATION_ENABLED === 'true';
}

/** Persist an automation event before acknowledging the payment webhook. */
export async function queueTransactionAutomation(
  type: TransactionAutomationType,
  body: Record<string, unknown>
): Promise<{ accepted: boolean; duplicate: boolean; skipped: boolean }> {
  const message = buildAutomationMessage(type, body);
  if (!message) return { accepted: false, duplicate: false, skipped: true };
  const { url } = requireSupabase();
  const enabled = automationEnabled();
  const response = await fetch(`${url}/rest/v1/message_log?on_conflict=event_key`, {
    method: 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    }),
    body: JSON.stringify({
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
    }),
  });
  if (!response.ok) {
    throw new Error(`Automation queue insert failed ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const rows = await response.json() as QueueRow[];
  return { accepted: rows.length > 0, duplicate: rows.length === 0, skipped: !enabled };
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
  if (!automationEnabled()) return { claimed: 0, sent: 0, failed: 0 };
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
