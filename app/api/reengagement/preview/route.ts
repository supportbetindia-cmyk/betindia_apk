import { NextResponse } from 'next/server';
import { previewCampaign } from '@/lib/campaign-sender';
import type { UserInput } from '@/lib/reengagement';
import { getRequestTenantId } from '@/lib/tenant-server';
import { parseMasterId } from '@/lib/master-filter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

// Preview both audiences from an uploaded user list. Behind the dashboard login.
export async function POST(req: Request) {
  try {
    const body = await req.json() as { users?: UserInput[] };
    const masterId = parseMasterId(new URL(req.url).searchParams);
    const tenantId = await getRequestTenantId();
    const users = Array.isArray(body.users) ? body.users : [];
    if (users.length === 0) {
      return NextResponse.json({ ok: false, error: 'No users provided' }, { status: 400 });
    }
    const scopedUsers = masterId ? users.filter((user) => user.branch_id === masterId) : users;
    const seg = await previewCampaign(scopedUsers, tenantId, masterId);
    return NextResponse.json({
      ok: true,
      counts: seg.counts,
      totalBonus: seg.totalBonus,
      sample: { winback: seg.winback.slice(0, 20), firstDeposit: seg.firstDeposit.slice(0, 20) },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
