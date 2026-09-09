import { NextResponse } from 'next/server';
import { runDailyCampaigns } from '@/lib/campaign-sender';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily re-engagement campaign cron. Auth: CRON_SECRET bearer (same as other crons).
// The batch can take minutes (hundreds of sends), which exceeds a scheduler's HTTP
// timeout — so we start it fire-and-forget and return immediately. The persistent
// Node process keeps sending; results appear on the Campaigns page.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  void runDailyCampaigns()
    .then((r) => console.log('[cron/campaigns] done', JSON.stringify(r)))
    .catch((err) => console.error('[cron/campaigns] failed', err));

  return NextResponse.json({ started: true });
}
