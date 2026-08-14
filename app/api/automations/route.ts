import { NextResponse } from 'next/server';
import { interaktConfigured } from '@/lib/interakt';
import { automationEnabled } from '@/lib/automations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RULES = [
  { event: 'Deposit received', template: 'betindia_deposit_status_update', trigger: 'durable queue' },
  { event: 'Withdrawal received', template: 'betindia_withdrawal_status_update', trigger: 'durable queue' },
];

async function fetchLog() {
  if (!SUPABASE_URL || !SERVICE_ROLE) return { logs: [], needsSetup: false };
  const url = `${SUPABASE_URL}/rest/v1/message_log?select=*&order=created_at.desc&limit=50`;
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
  const { logs, needsSetup } = await fetchLog();
  return NextResponse.json({
    enabled: automationEnabled(),
    interaktConfigured: interaktConfigured(),
    rules: RULES,
    needsSetup,
    recent: logs,
  });
}
