'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { backendRequest } from '@/lib/backend-api';
import { useMasterFilter } from './MasterFilterProvider';

export function MasterFilter() {
  const { masterId, tenantId, setMasterId } = useMasterFilter();
  const pathname = usePathname();
  const query = useQuery({
    queryKey: ['masters', tenantId],
    // Older backends return a bare array; newer ones say whether this member is master-restricted.
    queryFn: ({ signal }) => backendRequest<string[] | { masters: string[]; restricted: boolean }>('/customers/masters', { tenantId, signal }),
    select: (data) => (Array.isArray(data) ? { masters: data, restricted: false } : data),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });
  const masters = query.data?.masters ?? [];
  const restricted = query.data?.restricted ?? false;
  // A restricted member has no "All Masters" view; pin them to one of their own.
  useEffect(() => {
    if (restricted && masters.length && !masters.includes(masterId)) setMasterId(masters[0]);
  }, [restricted, masters, masterId, setMasterId]);
  const companySettings = pathname.startsWith('/settings') || ['/admin', '/automations', '/webhooks', '/notifications'].includes(pathname);
  return <div className="master-filter">
    <label htmlFor="global-master-filter">Master ID</label>
    <select id="global-master-filter" value={masterId} onChange={(e) => setMasterId(e.target.value)} aria-describedby="master-filter-note">
      {restricted ? null : <option value="">All Masters</option>}
      {!restricted && masterId && !masters.includes(masterId) ? <option value={masterId}>{masterId}</option> : null}
      {masters.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
    <small id="master-filter-note">
      {companySettings ? 'Company-wide settings. Master selection is kept for data pages.' : masterId ? `Showing Master ${masterId}` : 'All players in this company'}
    </small>
    {query.isPending && tenantId ? <small role="status">Loading masters…</small> : null}
    {query.isError ? <div role="alert"><small>Could not load masters.</small><button type="button" onClick={() => void query.refetch()}>Retry</button></div> : null}
  </div>;
}
