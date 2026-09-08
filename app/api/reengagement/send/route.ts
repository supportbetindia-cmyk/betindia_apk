import { NextResponse } from 'next/server';
import { sendCampaign, campaignConfigured, type Audience } from '@/lib/campaign-sender';
import type { UserInput } from '@/lib/reengagement';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Send a campaign batch. Behind the dashboard login (admin only). Real WhatsApp
// messages go out here, so the caller (UI) must confirm first.
export async function POST(req: Request) {
  if (!campaignConfigured()) {
    return NextResponse.json({ ok: false, error: 'INTERAKT_CAMPAIGN_API_KEY is not set on the server' }, { status: 503 });
  }
  try {
    const body = await req.json() as { users?: UserInput[]; audience?: string; limit?: number };
    const users = Array.isArray(body.users) ? body.users : [];
    const audience = body.audience;
    if (users.length === 0) {
      return NextResponse.json({ ok: false, error: 'No users provided' }, { status: 400 });
    }
    if (audience !== 'winback' && audience !== 'first_deposit') {
      return NextResponse.json({ ok: false, error: 'audience must be winback or first_deposit' }, { status: 400 });
    }
    // Cap per request so one click can't run for minutes; use the CLI for big blasts.
    const limit = Math.min(Math.max(1, Number(body.limit) || 20), 200);
    const result = await sendCampaign(users, audience as Audience, limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
