import { NextResponse } from 'next/server';
import { sendDormantWinback, winbackConfigured } from '@/lib/campaign-sender';
import { isCampaignsEnabled } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily automatic win-back to dormant depositors. Auth: CRON_SECRET bearer.
// Gated by the campaigns toggle. Cooldown + per-day dedupe live in the sender,
// so re-runs are safe. Fire-and-forget: the batch can take minutes, longer than
// a scheduler's HTTP timeout, so we return immediately and keep sending.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isCampaignsEnabled())) {
    return NextResponse.json({ ran: false, reason: 'campaigns disabled from dashboard' });
  }
  if (!(await winbackConfigured())) {
    return NextResponse.json({ ran: false, reason: 'no winback key (set the retention account or INTERAKT_CAMPAIGN_API_KEY)' });
  }

  const cap = Number(process.env.CAMPAIGN_WINBACK_DAILY) || 200;
  void sendDormantWinback(cap)
    .then((r) => console.log('[cron/dormant-winback] done', JSON.stringify(r)))
    .catch((err) => console.error('[cron/dormant-winback] failed', err));

  return NextResponse.json({ started: true, cap });
}
