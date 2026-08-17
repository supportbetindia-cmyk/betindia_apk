import { NextResponse } from 'next/server';
import { AUTOMATION_KEYS, setSetting, getAutomationSettings, type AutomationKey } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Flip one automation switch. Protected by the dashboard session (middleware
// gates every /api route except login/wati/cron), so only a logged-in admin
// reaches this. Body: { key: 'automation_enabled'|'automation_deposit'|'automation_withdrawal', value: boolean }.
export async function POST(req: Request) {
  let body: { key?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const key = body.key;
  if (!key || !AUTOMATION_KEYS.includes(key as AutomationKey)) {
    return NextResponse.json({ error: `key must be one of: ${AUTOMATION_KEYS.join(', ')}` }, { status: 400 });
  }
  if (typeof body.value !== 'boolean') {
    return NextResponse.json({ error: 'value must be true or false' }, { status: 400 });
  }

  try {
    await setSetting(key as AutomationKey, body.value);
    const settings = await getAutomationSettings();
    return NextResponse.json({ ok: true, toggles: settings });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
