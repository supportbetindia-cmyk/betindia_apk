import { NextResponse } from 'next/server';
import { fetchCampaignLog } from '@/lib/campaign-sender';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Recent campaign sends for the dashboard list. Behind the login.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const status = params.get('status') || 'all';
  const q = params.get('q') || '';
  const rows = await fetchCampaignLog(status, 200, q);
  return NextResponse.json({ ok: true, rows });
}
