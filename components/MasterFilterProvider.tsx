'use client';

import { createContext, useContext, useCallback, useMemo, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getSelectedTenantId } from '@/lib/backend-api';
import { withMaster } from '@/lib/master-filter';

type MasterFilter = {
  masterId: string;
  tenantId: string | null;
  setMasterId: (value: string) => void;
  scopedHref: (href: string) => string;
};

const Context = createContext<MasterFilter | null>(null);
function subscribeTenant(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener('ci-tenant-change', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('ci-tenant-change', onChange);
  };
}
const serverTenant = () => null;

export function MasterFilterProvider({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const masterId = params.get('masterId')?.trim() ?? '';
  const tenantId = useSyncExternalStore(subscribeTenant, getSelectedTenantId, serverTenant);
  const scopedHref = useCallback((href: string) => withMaster(href, masterId), [masterId]);
  const setMasterId = useCallback((value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('page');
    // Next integrates native history with useSearchParams; Back restores the scope.
    window.history.pushState(null, '', withMaster(`${pathname}${url.search}${url.hash}`, value));
  }, [pathname]);
  const value = useMemo(() => ({ masterId, tenantId, setMasterId, scopedHref }), [masterId, tenantId, setMasterId, scopedHref]);

  return <Context.Provider value={value}>
    {/* Discard old pagination, selected rows, previews and in-flight local state. */}
    <div key={JSON.stringify([tenantId, masterId])} style={{ display: 'contents' }}>{children}</div>
  </Context.Provider>;
}

export function useMasterFilter() {
  const context = useContext(Context);
  if (!context) throw new Error('useMasterFilter requires MasterFilterProvider');
  return context;
}


