import { NextResponse } from 'next/server';
import { sendTestMessage } from '@/lib/whatsapp-settings';

// Send one real template message to prove an account's key works.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!role || !phone) return NextResponse.json({ ok: false, error: 'role and phone are required' }, { status: 400 });
  try {
    return NextResponse.json(await sendTestMessage(role, phone));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Test failed' }, { status: 500 });
  }
}
