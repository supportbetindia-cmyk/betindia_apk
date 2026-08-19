import { NextResponse } from 'next/server';
import { TOGGLE_KEYS, setSetting, getAllToggles, type ToggleKey } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Flip one switch. Protected by the dashboard session (middleware gates every
// /api route except login/wati/cron), so only a logged-in admin reaches this.
// Body: { key: <one of TOGGLE_KEYS>, value: boolean }.
export async function POST(req: Request) {
  let body: { key?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const key = body.key;
  if (!key || !TOGGLE_KEYS.includes(key as ToggleKey)) {
    return NextResponse.json({ error: `key must be one of: ${TOGGLE_KEYS.join(', ')}` }, { status: 400 });
  }
  if (typeof body.value !== 'boolean') {
    return NextResponse.json({ error: 'value must be true or false' }, { status: 400 });
  }

  try {
    await setSetting(key as ToggleKey, body.value);
    const toggles = await getAllToggles();
    return NextResponse.json({ ok: true, toggles });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
