import { NextResponse } from 'next/server';
import { fetchDormantDepositors, sendDormantWinback, campaignConfigured } from '@/lib/campaign-sender';
import { getRequestTenantId, requestErrorStatus } from '@/lib/tenant-server';
import { parseMasterId } from '@/lib/master-filter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

// GET = preview only (how many dormant depositors are eligible right now).
export async function GET(req: Request) {
  try {
    const masterId = parseMasterId(new URL(req.url).searchParams);
    const tenantId = await getRequestTenantId();
    if (!campaignConfigured()) {
      return NextResponse.json({ configured: false, error: 'INTERAKT_CAMPAIGN_API_KEY not set on the server' });
    }
    const { counts } = await fetchDormantDepositors(undefined, Date.now(), tenantId, masterId);
    return NextResponse.json({ configured: true, ...counts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: requestErrorStatus(err) });
  }
}

// POST = actually send the win-back template to eligible dormant depositors.
export async function POST(req: Request) {
  try {
    const masterId = parseMasterId(new URL(req.url).searchParams);
    const tenantId = await getRequestTenantId();
    if (!campaignConfigured()) {
      return NextResponse.json({ error: 'INTERAKT_CAMPAIGN_API_KEY not set on the server' }, { status: 503 });
    }
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.min(Math.max(1, Number(body.limit) || 200), 300);
    const result = await sendDormantWinback(limit, undefined, tenantId, masterId);
    return NextResponse.json({ ran: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: requestErrorStatus(err) });
  }
}
