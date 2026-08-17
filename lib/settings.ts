// Live, dashboard-controlled settings backed by the app_settings table. The
// webhook and cron read these on every event, so a toggle in the UI takes effect
// within seconds without a redeploy. If the table/DB is unreachable we fall back
// to the AUTOMATION_ENABLED env var so behaviour never silently changes.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CACHE_TTL_MS = 5_000;

export type AutomationSettings = {
  enabled: boolean;      // master switch
  deposit: boolean;      // send on deposits
  withdrawal: boolean;   // send on withdrawals
};

export const AUTOMATION_KEYS = ['automation_enabled', 'automation_deposit', 'automation_withdrawal'] as const;
export type AutomationKey = (typeof AUTOMATION_KEYS)[number];

let cache: { value: Record<string, string>; expiresAt: number } | null = null;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: SERVICE_ROLE ?? '', Authorization: `Bearer ${SERVICE_ROLE}`, ...extra };
}

async function loadSettings(): Promise<Record<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (!SUPABASE_URL || !SERVICE_ROLE) return cache?.value ?? {};
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?select=key,value`, {
      headers: headers(),
      cache: 'no-store',
    });
    if (!res.ok) return cache?.value ?? {};
    const rows = (await res.json()) as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    cache = { value: map, expiresAt: Date.now() + CACHE_TTL_MS };
    return map;
  } catch {
    return cache?.value ?? {};
  }
}

/** Default used before anyone has touched the DB switch (keeps the env var meaningful). */
function envDefault(): boolean {
  return process.env.AUTOMATION_ENABLED === 'true';
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const s = await loadSettings();
  const master = s.automation_enabled ?? String(envDefault());
  return {
    enabled: master === 'true',
    deposit: (s.automation_deposit ?? 'true') === 'true',
    withdrawal: (s.automation_withdrawal ?? 'true') === 'true',
  };
}

/** True only if the master switch is on AND (for a given event) that channel is on. */
export async function isAutomationEnabled(type?: 'deposit' | 'withdrawal'): Promise<boolean> {
  const s = await getAutomationSettings();
  if (!s.enabled) return false;
  if (type === 'deposit') return s.deposit;
  if (type === 'withdrawal') return s.withdrawal;
  return true;
}

export async function setSetting(key: AutomationKey, value: boolean): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?on_conflict=key`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key, value: value ? 'true' : 'false', updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`Setting update failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  cache = null; // reflect the change immediately
}
