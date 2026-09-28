import { NextResponse } from 'next/server';
import { fetchCampaignSummary } from '@/lib/campaign-sender';
import { getRequestTenantId, requestErrorStatus } from '@/lib/tenant-server';
import { parseMasterId } from '@/lib/master-filter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Per-day sent/failed/skipped totals for campaign messages. Behind the login.
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const masterId = parseMasterId(params);
    const tenantId = await getRequestTenantId();
    const days = await fetchCampaignSummary(14, tenantId, masterId);
    return NextResponse.json({ ok: true, days });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'request failed' }, { status: requestErrorStatus(error) });
  }
}
