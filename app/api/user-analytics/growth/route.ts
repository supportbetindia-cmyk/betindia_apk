import { NextResponse } from 'next/server';
import { computeGrowth } from '@/lib/growth';
import { getRequestTenantId, requestErrorStatus } from '@/lib/tenant-server';
import { parseMasterId } from '@/lib/master-filter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const masterId = parseMasterId(p);
    const from = p.get('from'), to = p.get('to'), prevFrom = p.get('prevFrom'), prevTo = p.get('prevTo');
    const label = p.get('label') ?? '';
    if (!from || !to || !prevFrom || !prevTo) {
      return NextResponse.json({ error: 'from, to, prevFrom and prevTo are required.' }, { status: 400 });
    }
    for (const v of [from, to, prevFrom, prevTo]) {
      if (Number.isNaN(Date.parse(v))) return NextResponse.json({ error: 'Invalid timestamp.' }, { status: 400 });
    }
    const tenantId = await getRequestTenantId();
    const result = await computeGrowth(tenantId, from, to, prevFrom, prevTo, label, masterId);
    return NextResponse.json({ configured: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404|not configured/i.test(message);
    return NextResponse.json({ configured: !needsSetup, error: message }, { status: needsSetup ? 200 : requestErrorStatus(err) });
  }
}
