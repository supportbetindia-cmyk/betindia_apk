import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteTenantWhatsApp, listTenantWhatsApp, saveTenantWhatsApp } from '@/lib/whatsapp-settings';
import { DEFAULT_TENANT_ID } from '@/lib/tenant';

// The company the user has selected (saas tenant). Falls back to the legacy default.
// This is what the backend automation also uses, so keys land where it looks for them.
async function currentTenant(): Promise<string> {
  return (await cookies()).get('ci_selected_tenant_id')?.value || DEFAULT_TENANT_ID;
}

// List all accounts for the selected company (keys masked).
export async function GET() {
  return NextResponse.json({ accounts: await listTenantWhatsApp(await currentTenant()) });
}

// Create/update one account. Requires a role; send apiKey only when changing it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  if (!role) return NextResponse.json({ error: 'role is required' }, { status: 400 });
  const tenantId = await currentTenant();

  try {
    await saveTenantWhatsApp({
      role,
      label: typeof body.label === 'string' ? body.label : undefined,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined,
      templates: body.templates,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    }, tenantId);
    return NextResponse.json({ accounts: await listTenantWhatsApp(tenantId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 });
  }
}

// Remove one account by role.
export async function DELETE(req: Request) {
  const role = new URL(req.url).searchParams.get('role')?.trim();
  if (!role) return NextResponse.json({ error: 'role is required' }, { status: 400 });
  const tenantId = await currentTenant();
  try {
    await deleteTenantWhatsApp(role, tenantId);
    return NextResponse.json({ accounts: await listTenantWhatsApp(tenantId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Delete failed' }, { status: 500 });
  }
}
