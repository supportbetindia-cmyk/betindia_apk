'use client';

import { useQuery } from '@tanstack/react-query';
import { backendRequest, getSelectedTenantId, type BackendMe } from '@/lib/backend-api';

/** The selected company's loss-commission rate as a percent (0..100), default 3.
 * Reuses the cached /me query (same key as the Admin page), so no extra fetch. */
export function useLossCommissionRate(): number {
  const tenantId = getSelectedTenantId();
  const me = useQuery({
    queryKey: ['me', tenantId],
    queryFn: () => backendRequest<BackendMe>('/me', { tenantId: null }),
    enabled: Boolean(tenantId),
  });
  return me.data?.tenants.find((t) => t.id === tenantId)?.lossCommissionPct ?? 3;
}
