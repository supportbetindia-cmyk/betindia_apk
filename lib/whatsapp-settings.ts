// WhatsApp account registry — SERVER ONLY (service_role). One account per role, e.g.
// 'updates' for deposit/withdrawal automation. Import only from route handlers.

import { getCurrentTenantId } from './tenant';
import { sendWhatsAppTemplate } from './interakt';
import { TEMPLATES, type TransactionTemplates } from './automation-message';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const UPDATES_ROLE = 'updates'; // the account the transaction automation sends from

export type WhatsAppSettings = { apiKey: string | undefined; templates: TransactionTemplates };
export type WhatsAppAccount = {
  role: string; label: string; enabled: boolean;
  hasKey: boolean; maskedKey: string; templates: TransactionTemplates;
  // Whether this account resolves to a real key right now (own key, or the env
  // default for 'updates') — i.e. whether it would actually send.
  activeKey: boolean;
};

function headers(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_ROLE ?? '', Authorization: `Bearer ${SERVICE_ROLE}`, ...extra };
}

// The 'updates' account seeds the 6 deposit/withdrawal defaults; other accounts
// start empty and define their own template names.
function mergeTemplates(saved: Partial<TransactionTemplates> | null | undefined, role: string): TransactionTemplates {
  const base = role === UPDATES_ROLE ? TEMPLATES : {};
  return { ...base, ...(saved ?? {}) } as TransactionTemplates;
}

function mask(key: string | null | undefined): string {
  return key ? `••••••${key.slice(-4)}` : '';
}

/** The key + templates the automation should use for a role (env fallback for 'updates'). */
export async function getTenantWhatsApp(
  role: string = UPDATES_ROLE,
  tenantId: string = getCurrentTenantId(),
): Promise<WhatsAppSettings> {
  const envKey = role === UPDATES_ROLE ? process.env.INTERAKT_API_KEY : undefined;
  if (!SUPABASE_URL || !SERVICE_ROLE) return { apiKey: envKey, templates: mergeTemplates(null, role) };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/whatsapp_settings?tenant_id=eq.${tenantId}&role=eq.${role}&enabled=eq.true&select=api_key,templates`,
    { headers: headers(), cache: 'no-store' },
  );
  const row = res.ok ? (await res.json())[0] : null;
  return { apiKey: row?.api_key || envKey, templates: mergeTemplates(row?.templates, role) };
}

/** All accounts for a company, keys masked — for the settings page. */
export async function listTenantWhatsApp(tenantId: string = getCurrentTenantId()): Promise<WhatsAppAccount[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return [];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/whatsapp_settings?tenant_id=eq.${tenantId}&select=role,label,api_key,templates,enabled&order=role`,
    { headers: headers(), cache: 'no-store' },
  );
  const rows: Array<{ role: string; label: string | null; api_key: string | null; templates: Partial<TransactionTemplates>; enabled: boolean }> =
    res.ok ? await res.json() : [];
  const envKey = Boolean(process.env.INTERAKT_API_KEY);
  return rows.map((r) => ({
    role: r.role, label: r.label ?? r.role, enabled: r.enabled,
    hasKey: Boolean(r.api_key), maskedKey: mask(r.api_key), templates: mergeTemplates(r.templates, r.role),
    activeKey: Boolean(r.api_key) || (r.role === UPDATES_ROLE && envKey),
  }));
}

/** Send a real template message to a number, to prove the account's key works. */
export async function sendTestMessage(role: string, phone: string): Promise<{ ok: boolean; error?: string }> {
  const wa = await getTenantWhatsApp(role);
  if (!wa.apiKey) return { ok: false, error: 'No API key set for this account' };
  const templateName = Object.values(wa.templates)[0];
  if (!templateName) return { ok: false, error: 'Add at least one template first' };
  return sendWhatsAppTemplate({
    phoneNumber: phone.replace(/\D/g, '').slice(-10),
    countryCode: '+91',
    templateName,
    // Generous placeholder set so any 1–8 variable template fills in.
    bodyValues: ['Test', 'TEST123', '100', 'INR', 'TXN123', new Date().toLocaleDateString('en-IN'), '12:00 PM', 'test'],
  }, wa.apiKey);
}

/** Create or update one account (by role). Send apiKey only when changing it. */
export async function saveTenantWhatsApp(
  input: { role: string; label?: string; apiKey?: string | null; templates?: Partial<TransactionTemplates>; enabled?: boolean },
  tenantId: string = getCurrentTenantId(),
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Server is missing Supabase credentials');
  const body: Record<string, unknown> = { tenant_id: tenantId, role: input.role, updated_at: new Date().toISOString() };
  if (input.label !== undefined) body.label = input.label;
  if (input.apiKey !== undefined) body.api_key = input.apiKey || null;
  if (input.templates !== undefined) body.templates = mergeTemplates(input.templates, input.role);
  if (input.enabled !== undefined) body.enabled = input.enabled;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_settings?on_conflict=tenant_id,role`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Could not save account (${res.status})`);
}
