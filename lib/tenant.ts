// Resolving the "current tenant" for tenant-scoped data.
//
// While the app still uses the legacy shared-password login (no per-user Supabase
// session on the main pages), we default to the BetIndia tenant. After the
// Supabase-Auth cutover, getCurrentTenantId() will resolve the tenant from the
// logged-in user's membership instead of this constant.
export const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || 'b6e68fb7-ca2e-49be-b1e5-74601e59a041'; // BetIndia

export function getCurrentTenantId(): string {
  return DEFAULT_TENANT_ID;
}
