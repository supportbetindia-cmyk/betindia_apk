import { NextResponse } from 'next/server';
import { fetchCampaignSummary } from '@/lib/campaign-sender';
import { getRequestTenantId } from '@/lib/tenant-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Per-day sent/failed/skipped totals for campaign messages. Behind the login.
export async function GET() {
  const tenantId = await getRequestTenantId();
  const days = await fetchCampaignSummary(14, tenantId);
  return NextResponse.json({ ok: true, days });
}
