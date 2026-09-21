import { NextResponse } from 'next/server';
import { importUserRows, type ImportUserRow } from '@/lib/user-analytics';
import { getRequestTenantId } from '@/lib/tenant-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { users?: unknown };
    const rows = Array.isArray(body.users) ? (body.users as ImportUserRow[]) : [];
    const valid = rows.filter((u) => u && typeof u === 'object' && u.user_id);
    if (!valid.length) {
      return NextResponse.json({ error: 'No users to import.' }, { status: 400 });
    }
    const tenantId = await getRequestTenantId();
    const imported = await importUserRows(valid, tenantId);
    return NextResponse.json({ configured: true, imported });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404|not configured/i.test(message);
    return NextResponse.json({ configured: !needsSetup, error: message }, { status: needsSetup ? 200 : 500 });
  }
}
