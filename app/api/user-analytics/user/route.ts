import { NextResponse } from 'next/server';
import { fetchUserTransactions } from '@/lib/user-analytics';
import { getRequestTenantId } from '@/lib/tenant-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const userId = new URL(req.url).searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    const tenantId = await getRequestTenantId();
    const transactions = await fetchUserTransactions(tenantId, userId);
    return NextResponse.json({ configured: true, userId, transactions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404|not configured/i.test(message);
    return NextResponse.json({ configured: !needsSetup, error: message }, { status: needsSetup ? 200 : 500 });
  }
}
