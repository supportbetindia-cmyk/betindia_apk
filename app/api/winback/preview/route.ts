import { NextResponse } from 'next/server';
import { getWinbackSegment, DEFAULT_WINBACK_CONFIG } from '@/lib/winback';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Preview the win-back segment: who WOULD be messaged, per-tier counts, and the
// total bonus cost — without sending anything. Protected by the dashboard login
// (middleware gates every /api route except login/wati/cron).
export async function GET() {
  try {
    const segment = await getWinbackSegment(DEFAULT_WINBACK_CONFIG);
    return NextResponse.json({ ok: true, config: DEFAULT_WINBACK_CONFIG, ...segment });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
