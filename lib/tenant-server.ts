// Resolve the tenant for the CURRENT request (route handlers / server components).
// - Supabase-authenticated user  -> their active membership's tenant
// - Legacy password login (no Supabase user) -> BetIndia default
// Any failure falls back to BetIndia, so reads never break for existing users.
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { DEFAULT_TENANT_ID } from './tenant';

const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function getRequestTenantId(): Promise<string> {
  try {
    if (!PUBLIC_URL || !ANON) return DEFAULT_TENANT_ID;
    const cookieStore = await cookies();
    const supabase = createServerClient(PUBLIC_URL, ANON, {
      cookies: { getAll() { return cookieStore.getAll(); }, setAll() { /* read-only here */ } },
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user) return DEFAULT_TENANT_ID; // password-login user → BetIndia

    const params = new URLSearchParams({
      select: 'tenant_id',
      auth_user_id: `eq.${data.user.id}`,
      status: 'eq.active',
      limit: '1',
    });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tenant_memberships?${params.toString()}`, {
      headers: { apikey: SERVICE_ROLE ?? '', Authorization: `Bearer ${SERVICE_ROLE}` },
      cache: 'no-store',
    });
    const rows = res.ok ? ((await res.json()) as Array<{ tenant_id: string }>) : [];
    return rows[0]?.tenant_id || DEFAULT_TENANT_ID;
  } catch {
    return DEFAULT_TENANT_ID;
  }
}
