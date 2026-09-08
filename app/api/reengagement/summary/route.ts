import { NextResponse } from 'next/server';
import { fetchCampaignSummary } from '@/lib/campaign-sender';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Per-day sent/failed/skipped totals for campaign messages. Behind the login.
export async function GET() {
  const days = await fetchCampaignSummary(14);
  return NextResponse.json({ ok: true, days });
}
