import { NextResponse } from 'next/server';
import { matchUserIds } from '@/lib/user-analytics';
import { getRequestTenantId } from '@/lib/tenant-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { userIds?: unknown };
    const ids = Array.isArray(body.userIds) ? body.userIds.map((v) => String(v)) : [];
    if (!ids.length) {
      return NextResponse.json({ error: 'No user IDs provided.' }, { status: 400 });
    }
    const tenantId = await getRequestTenantId();
    const result = await matchUserIds(tenantId, ids);
    return NextResponse.json({ configured: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404|not configured/i.test(message);
    return NextResponse.json({ configured: !needsSetup, error: message }, { status: needsSetup ? 200 : 500 });
  }
}
