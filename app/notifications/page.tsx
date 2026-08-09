'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Notifications } from '@/components/Notifications';
import { LogOut } from 'lucide-react';

export default function NotificationsPage() {
  const router = useRouter();

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
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
          <div className="topbar-actions">
            <button className="logout-btn2" onClick={logout}><LogOut size={15} /><span>Log out</span></button>
          </div>
        </header>

        <Notifications />
      </main>
    </div>
  );
}
