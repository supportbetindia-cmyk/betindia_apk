import { NextResponse } from 'next/server';
import { fetchCampaignLog } from '@/lib/campaign-sender';
import { getRequestTenantId, requestErrorStatus } from '@/lib/tenant-server';
import { parseMasterId } from '@/lib/master-filter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Recent campaign sends for the dashboard list. Behind the login.
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const status = params.get('status') || 'all';
    const q = params.get('q') || '';
    const masterId = parseMasterId(params);
    const tenantId = await getRequestTenantId();
    const rows = await fetchCampaignLog(status, 200, q, tenantId, masterId);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'request failed' }, { status: requestErrorStatus(error) });
  }
}
