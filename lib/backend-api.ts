'use client';

import { getSupabaseBrowser } from './supabase-browser';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000')
  .replace(/(?:\/api\/v1)+\/?$/, '')
  .replace(/\/$/, '');
const TENANT_STORAGE_KEY = 'ci_selected_tenant_id';

export type BackendTenant = {
  id: string;
  name: string;
  role: string;
  status?: string;
};

export type BackendMe = {
  user: { id: string; supabaseUserId: string; email: string; name: string | null };
  tenants: BackendTenant[];
};

export class BackendApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BackendApiError';
  }
}

export function getBackendBaseUrl(): string {
  return BACKEND_URL;
}

export function getSelectedTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TENANT_STORAGE_KEY);
}

export function setSelectedTenantId(tenantId: string): void {
  window.localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
  // Mirror to a cookie so server-side legacy API routes know the active company.
  // (localStorage is client-only; the cookie is what getRequestTenantId reads.)
  document.cookie = `${TENANT_STORAGE_KEY}=${tenantId}; path=/; max-age=31536000; samesite=lax`;
}

export function clearSelectedTenantId(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TENANT_STORAGE_KEY);
  document.cookie = `${TENANT_STORAGE_KEY}=; path=/; max-age=0; samesite=lax`;
}

export async function backendRequest<T>(
  path: string,
  options: RequestInit & { tenantId?: string | null } = {},
): Promise<T> {
  const { data, error } = await getSupabaseBrowser().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new BackendApiError('Your session has expired. Please sign in again.', 401);
  }

  const tenantId = options.tenantId === undefined ? getSelectedTenantId() : options.tenantId;
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  headers.set('Accept', 'application/json');
  if (tenantId) headers.set('x-tenant-id', tenantId);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${BACKEND_URL}/api/v1${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
  });
  const body = await response.json().catch(() => null) as { message?: string } | T | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body
      ? String(body.message)
      : `Backend request failed (${response.status})`;
    throw new BackendApiError(message, response.status);
  }
  return body as T;
}
