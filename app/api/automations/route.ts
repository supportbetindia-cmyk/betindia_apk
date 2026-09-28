import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { interaktConfigured } from '@/lib/interakt';
import { getAllToggles } from '@/lib/settings';
import { getQueueHealth } from '@/lib/automations';
import { DEFAULT_TENANT_ID } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RULES = [
  { event: 'Deposit received', template: 'betindia_deposit_status_update', trigger: 'auto WhatsApp' },
  { event: 'Withdrawal received', template: 'betindia_withdrawal_status_update', trigger: 'auto WhatsApp' },
];

async function fetchLog(tenantId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return { logs: [], needsSetup: false };
  // Scope to the selected company so each tenant sees only its own messages.
  const url = `${SUPABASE_URL}/rest/v1/message_log?tenant_id=eq.${tenantId}&select=*&order=created_at.desc&limit=50`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    if (/PGRST205|does not exist|Could not find the table/i.test(body)) return { logs: [], needsSetup: true };
    return { logs: [], needsSetup: false };
  }
  return { logs: await res.json(), needsSetup: false };
}

export async function GET() {
  const tenantId = (await cookies()).get('ci_selected_tenant_id')?.value || DEFAULT_TENANT_ID;
  const [{ logs, needsSetup }, toggles, health] = await Promise.all([
    fetchLog(tenantId),
    getAllToggles(),
    getQueueHealth(),
  ]);
  return NextResponse.json({
    enabled: toggles.enabled,
    toggles,
    health,
    interaktConfigured: interaktConfigured(),
    rules: RULES,
    needsSetup,
    recent: logs,
  });
}
