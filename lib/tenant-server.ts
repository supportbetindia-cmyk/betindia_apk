// Request-scoped authorization for legacy readers using the service-role key.
// Use the same membership/permission checks as the NestJS business endpoints.
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export class RequestScopeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function requestErrorStatus(error: unknown): number {
  if (error instanceof RequestScopeError) return error.status;
  if (error instanceof Error && error.message.startsWith('Invalid masterId:')) return 400;
  return 500;
}

export async function getRequestTenantId(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new RequestScopeError('Authentication is unavailable', 503);
  const cookieStore = await cookies();
  const tenantId = cookieStore.get('ci_selected_tenant_id')?.value;
  if (!tenantId) throw new RequestScopeError('Select a company first', 400);
  const supabase = createServerClient(url, anon, {
    cookies: { getAll: () => cookieStore.getAll(), setAll() { /* middleware refreshes cookies */ } },
  });
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new RequestScopeError('Sign in to continue', 401);
  const backend = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000')
    .replace(/(?:\/api\/v1)+\/?$/, '').replace(/\/$/, '');
  // NestJS verifies the JWT and active membership; never fall back to another tenant.
  const response = await fetch(`${backend}/api/v1/tenants/current`, {
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'x-tenant-id': tenantId },
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new RequestScopeError('Unable to access the selected company', [400, 401, 403].includes(response.status) ? response.status : 503);
  }
  const body = await response.json() as { tenant?: { id?: string } };
  if (body.tenant?.id !== tenantId) throw new RequestScopeError('Invalid company scope', 403);
  return tenantId;
}
