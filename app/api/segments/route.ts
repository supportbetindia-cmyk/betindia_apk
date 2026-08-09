import { NextResponse } from 'next/server';
import { getSegments } from '@/lib/segments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const vipThreshold = Number(url.searchParams.get('vip')) || undefined;
  const inactiveDays = Number(url.searchParams.get('inactiveDays')) || undefined;

  try {
    const segments = await getSegments({ vipThreshold, inactiveDays });
    return NextResponse.json({ configured: true, segments });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404/i.test(message);
    return NextResponse.json({ configured: !needsSetup, error: message }, { status: needsSetup ? 200 : 500 });
  }
}
