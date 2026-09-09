import { NextResponse } from 'next/server';
import { importUsers, sendBoth, campaignConfigured } from '@/lib/campaign-sender';
import type { UserInput } from '@/lib/reengagement';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Upload → auto-send: save the user list to the DB, then send BOTH audiences
// (win-back + first-deposit) in the background. Behind the dashboard login.
export async function POST(req: Request) {
  if (!campaignConfigured()) {
    return NextResponse.json({ ok: false, error: 'INTERAKT_CAMPAIGN_API_KEY is not set on the server' }, { status: 503 });
  }
  try {
    const body = await req.json() as { users?: UserInput[] };
    const users = Array.isArray(body.users) ? body.users : [];
    if (users.length === 0) {
      return NextResponse.json({ ok: false, error: 'No users provided' }, { status: 400 });
    }

    const imported = await importUsers(users); // persist first (awaited)

    // Fire-and-forget: sending both audiences takes minutes; the always-on Node
    // process finishes while we return immediately. Results show on the Campaigns page.
    void sendBoth(users)
      .then((r) => console.log('[import-and-send] done', JSON.stringify(r)))
      .catch((err) => console.error('[import-and-send] failed', err));

    return NextResponse.json({ ok: true, imported, started: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
