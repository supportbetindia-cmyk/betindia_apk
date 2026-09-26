import { NextResponse } from 'next/server';
import { fetchUserAnalytics } from '@/lib/user-analytics';
import { getRequestTenantId, requestErrorStatus } from '@/lib/tenant-server';
import { parseMasterId } from '@/lib/master-filter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const masterId = parseMasterId(new URL(req.url).searchParams);
    const tenantId = await getRequestTenantId();
    const data = await fetchUserAnalytics(tenantId, Date.now(), masterId);
    return NextResponse.json({ configured: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A missing table (migration not run) or unconfigured env shows a friendly setup state.
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404|not configured/i.test(message);
    return NextResponse.json(
      { configured: !needsSetup, error: message },
      { status: needsSetup ? 200 : requestErrorStatus(err) }
    );
  }
}
