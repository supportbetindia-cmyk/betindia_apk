// Resolve the tenant for the current request. Supabase-authenticated users are
// restricted to active memberships; legacy password login keeps the BetIndia
// default used by the existing dashboard.
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { DEFAULT_TENANT_ID } from './tenant';

const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function requestErrorStatus(error: unknown): number {
  if (error instanceof Error && error.message.startsWith('Invalid masterId:')) return 400;
  return 500;
}

export async function getRequestTenantId(): Promise<string> {
  try {
    if (!PUBLIC_URL || !ANON) return DEFAULT_TENANT_ID;
    const cookieStore = await cookies();
    const supabase = createServerClient(PUBLIC_URL, ANON, {
      cookies: { getAll() { return cookieStore.getAll(); }, setAll() { /* read-only here */ } },
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user) return DEFAULT_TENANT_ID;

    const params = new URLSearchParams({ select: 'tenant_id', auth_user_id: `eq.${data.user.id}`, status: 'eq.active' });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tenant_memberships?${params.toString()}`, {
      headers: { apikey: SERVICE_ROLE ?? '', Authorization: `Bearer ${SERVICE_ROLE}` }, cache: 'no-store',
    });
    const memberships = res.ok ? ((await res.json()) as Array<{ tenant_id: string }>) : [];
    if (!memberships.length) return DEFAULT_TENANT_ID;
    const selected = cookieStore.get('ci_selected_tenant_id')?.value;
    if (selected && memberships.some((m) => m.tenant_id === selected)) return selected;
    return memberships[0].tenant_id;
  } catch {
    return DEFAULT_TENANT_ID;
  }
}
