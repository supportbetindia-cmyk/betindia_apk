import { NextResponse } from 'next/server';
import { parseDateRange } from '@/lib/date-range';
import { isConfigured } from '@/lib/supabase';
import { getMetricsSnapshot } from '@/lib/metrics-cache';
import { parseMasterId } from '@/lib/master-filter';

// The route stays dynamic for authentication, while the expensive metrics
// snapshot is shared briefly by the server-side cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Set SUPABASE_SERVICE_ROLE_KEY in dashboard/.env.local' },
      { status: 503 }
    );
  }

  try {
    const params = new URL(req.url).searchParams;
    const rangeKey = parseDateRange(params.get('range'));
    const masterId = parseMasterId(params);
    const snapshot = await getMetricsSnapshot(rangeKey, masterId);
    return NextResponse.json({
      ...snapshot.data,
      meta: {
        generatedAt: new Date(snapshot.generatedAt).toISOString(),
        cache: snapshot.state,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'read_failed', message }, { status: message.startsWith('Invalid masterId:') ? 400 : 500 });
  }
}
