import { NextResponse } from 'next/server';
import { fetchUserBreakdown } from '@/lib/user-analytics';
import { getRequestTenantId } from '@/lib/tenant-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) return NextResponse.json({ error: 'from and to are required.' }, { status: 400 });
    if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
      return NextResponse.json({ error: 'Invalid from/to timestamp.' }, { status: 400 });
    }
    const tenantId = await getRequestTenantId();
    const rows = await fetchUserBreakdown(tenantId, from, to);
    return NextResponse.json({ configured: true, rows, from, to });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404|not configured/i.test(message);
    return NextResponse.json({ configured: !needsSetup, error: message }, { status: needsSetup ? 200 : 500 });
  }
}
