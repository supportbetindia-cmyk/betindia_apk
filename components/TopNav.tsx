'use client';

import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Building2, LogOut } from 'lucide-react';
import { useMasterFilter } from '@/components/MasterFilterProvider';
import { backendRequest, type BackendMe } from '@/lib/backend-api';
import { logout } from '@/lib/logout';

// Routes with no company context (auth + workspace picker) — no navbar there.
const HIDE_ON = ['/saas-login', '/saas-signup', '/saas'];

/** Sticky top navbar: current company (left), signed-in admin + logout (right). */
export function TopNav() {
  const pathname = usePathname();
  const hidden = HIDE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const { tenantId } = useMasterFilter();

  const me = useQuery({
    queryKey: ['me-nav'],
    queryFn: ({ signal }) => backendRequest<BackendMe>('/me', { tenantId: null, signal }),
    enabled: !hidden,
    staleTime: 5 * 60_000,
  });

  if (hidden) return null;

  const company = me.data?.tenants.find((t) => t.id === tenantId);
  const admin = me.data?.user;
  const adminName = admin?.name?.trim() || admin?.email || '';

  return (
    <header className="topnav">
      <div className="topnav-left">
        <span className="topnav-logo"><Building2 size={16} /></span>
        <div className="topnav-co">
          <b>{company?.name ?? (me.isLoading ? 'Loading…' : 'Select a company')}</b>
          {company?.role ? <small>{company.role.toLowerCase()}</small> : null}
        </div>
      </div>
      <div className="topnav-right">
        {adminName ? (
          <div className="topnav-admin" title={admin?.email ?? ''}>
            <span className="topnav-avatar">{adminName.slice(0, 1).toUpperCase()}</span>
            <span className="topnav-admin-name">{adminName}</span>
          </div>
        ) : null}
        <button className="topnav-logout" onClick={() => void logout()}>
          <LogOut size={15} /> Logout
        </button>
      </div>
    </header>
  );
}
