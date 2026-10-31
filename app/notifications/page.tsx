'use client';
import { logout } from '@/lib/logout';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Notifications } from '@/components/Notifications';
import { LogOut } from 'lucide-react';

export default function NotificationsPage() {
  const router = useRouter();

  const logout = useCallback(async () => {
    await logout();
    router.refresh();
  }, [router]);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Push Notifications</h1>
            <p className="page-sub">Compose campaigns and monitor delivery performance</p>
          </div>
          <div className="topbar-actions">          </div>
        </header>

        <Notifications />
      </main>
    </div>
  );
}
