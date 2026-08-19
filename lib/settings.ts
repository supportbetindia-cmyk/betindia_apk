const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CACHE_TTL_MS = 5_000;

export type AutomationSettings = {
  enabled: boolean;      // master switch
  deposit: boolean;      // send on deposits
  withdrawal: boolean;   // send on withdrawals
};

export type AllToggles = AutomationSettings & {
  winback: boolean;      // daily win-back push
  statement: boolean;    // statement reconciliation sync
};

// Every switch the dashboard is allowed to flip. The toggle endpoint validates
// against this list, so an arbitrary key can never be written.
export const TOGGLE_KEYS = [
  'automation_enabled',
  'automation_deposit',
  'automation_withdrawal',
  'winback_enabled',
  'statement_enabled',
] as const;
export type ToggleKey = (typeof TOGGLE_KEYS)[number];

const HEARTBEAT_KEY = 'automation_cron_last_run';

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

function boolOf(map: Record<string, string>, key: string, fallback: boolean): boolean {
  const raw = map[key];
  if (raw === undefined) return fallback;
  return raw === 'true';
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const s = await loadSettings();
  return {
    enabled: boolOf(s, 'automation_enabled', envDefault()),
    deposit: boolOf(s, 'automation_deposit', true),
    withdrawal: boolOf(s, 'automation_withdrawal', true),
  };
}

export async function getAllToggles(): Promise<AllToggles> {
  const s = await loadSettings();
  return {
    enabled: boolOf(s, 'automation_enabled', envDefault()),
    deposit: boolOf(s, 'automation_deposit', true),
    withdrawal: boolOf(s, 'automation_withdrawal', true),
    winback: boolOf(s, 'winback_enabled', true),
    statement: boolOf(s, 'statement_enabled', true),
  };
}


export async function isAutomationEnabled(type?: 'deposit' | 'withdrawal'): Promise<boolean> {
  const s = await getAutomationSettings();
  if (!s.enabled) return false;
  if (type === 'deposit') return s.deposit;
  if (type === 'withdrawal') return s.withdrawal;
  return true;
}

export async function isWinbackEnabled(): Promise<boolean> {
  return boolOf(await loadSettings(), 'winback_enabled', true);
}

export async function isStatementEnabled(): Promise<boolean> {
  return boolOf(await loadSettings(), 'statement_enabled', true);
}

async function upsertSetting(key: string, value: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?on_conflict=key`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`Setting update failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  cache = null; // reflect the change immediately
}

export async function setSetting(key: ToggleKey, value: boolean): Promise<void> {
  await upsertSetting(key, value ? 'true' : 'false');
}

/** Stamp "the sender cron just ran" so the dashboard can detect a stalled cron. */
export async function recordCronRun(): Promise<void> {
  await upsertSetting(HEARTBEAT_KEY, new Date().toISOString());
}

export async function getCronLastRun(): Promise<string | null> {
  const s = await loadSettings();
  return s[HEARTBEAT_KEY] ?? null;
}
