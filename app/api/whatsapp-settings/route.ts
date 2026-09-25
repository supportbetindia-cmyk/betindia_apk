import { NextResponse } from 'next/server';
import { deleteTenantWhatsApp, listTenantWhatsApp, saveTenantWhatsApp } from '@/lib/whatsapp-settings';

// List all accounts (keys masked).
export async function GET() {
  return NextResponse.json({ accounts: await listTenantWhatsApp() });
}

// Create/update one account. Requires a role; send apiKey only when changing it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  if (!role) return NextResponse.json({ error: 'role is required' }, { status: 400 });

  try {
    await saveTenantWhatsApp({
      role,
      label: typeof body.label === 'string' ? body.label : undefined,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined,
      templates: body.templates,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    });
    return NextResponse.json({ accounts: await listTenantWhatsApp() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 });
  }
}

// Remove one account by role.
export async function DELETE(req: Request) {
  const role = new URL(req.url).searchParams.get('role')?.trim();
  if (!role) return NextResponse.json({ error: 'role is required' }, { status: 400 });
  try {
    await deleteTenantWhatsApp(role);
    return NextResponse.json({ accounts: await listTenantWhatsApp() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Delete failed' }, { status: 500 });
  }
}
