'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BellRing,
  CreditCard,
  MessageCircleMore,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// Only routes that are actually wired up. Add more here as pages are built.
const NAV = [
  { icon: BarChart3, label: 'Dashboard', href: '/' },
  { icon: CreditCard, label: 'Transactions', href: '/transactions' },
  { icon: BellRing, label: 'Push Notifications', href: '/notifications' },
  { icon: MessageCircleMore, label: 'WhatsApp CRM', href: '/whatsapp' },
  { icon: Zap, label: 'Automations', href: '/automations' },
] satisfies Array<{ icon: LucideIcon; label: string; href: string }>;

export function Sidebar({
  quickStats = [],
}: {
  quickStats?: { label: string; value: string }[];
}) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="logo">
        {/* Plain <img>: next/image optimizer rejects this PNG ("received null"). */}
        <img src="/betindialogo.png" alt="BetIndia" className="logo-img" />
        <div className="logo-console">Operations Console</div>
      </div>

      <div className="nav-section-label">Workspace</div>
      <nav className="nav">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className={`nav-item${active ? ' active' : ''}`}>
              <span className="nav-icon"><Icon size={18} strokeWidth={1.8} /></span>
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {quickStats.length > 0 ? (
        <div className="quick-stats">
          <div className="quick-title">Quick Stats</div>
          {quickStats.map((s) => (
            <div className="quick-row" key={s.label}>
              <span className="quick-label">{s.label}</span>
              <span className="quick-value">{s.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
