import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sendTestMessage } from '@/lib/whatsapp-settings';
import { DEFAULT_TENANT_ID } from '@/lib/tenant';

// Send one real template message to prove an account's key works.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!role || !phone) return NextResponse.json({ ok: false, error: 'role and phone are required' }, { status: 400 });
  const tenantId = (await cookies()).get('ci_selected_tenant_id')?.value || DEFAULT_TENANT_ID;
  try {
    return NextResponse.json(await sendTestMessage(role, phone, tenantId));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Test failed' }, { status: 500 });
  }
}
