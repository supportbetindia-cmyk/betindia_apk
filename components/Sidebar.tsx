'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BellRing,
  Building2,
  CreditCard,
  Users,
  UsersRound,
  LineChart,
  FileBarChart,
  Webhook,
  MessageCircleMore,
  Megaphone,
  PiggyBank,
  Settings,
  Target,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';

type NavItem = { icon: LucideIcon; label: string; href: string };
const NAV: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Manage', items: [
    { icon: TrendingUp, label: 'Overview', href: '/overview' },
    { icon: Target, label: 'Targets', href: '/targets' },
    { icon: PiggyBank, label: 'Profit split', href: '/profit' },
    { icon: Users, label: 'Players', href: '/customers' },
    { icon: CreditCard, label: 'Transactions', href: '/transactions' },
    { icon: Webhook, label: 'Webhooks', href: '/webhooks' },
  ] },
  { label: 'Engage', items: [
    { icon: MessageCircleMore, label: 'WhatsApp', href: '/whatsapp' },
    { icon: Megaphone, label: 'Campaigns', href: '/campaigns' },
    { icon: Zap, label: 'Automations', href: '/automations' },
    { icon: BellRing, label: 'Push notifications', href: '/notifications' },
  ] },
  { label: 'Analyse', items: [
    { icon: FileBarChart, label: 'Reports', href: '/reports' },
    { icon: BarChart3, label: 'Product analytics', href: '/' },
    { icon: LineChart, label: 'Player analytics', href: '/analytics' },
  ] },
  { label: 'Configure', items: [
    { icon: Building2, label: 'Departments', href: '/settings/departments' },
    { icon: UsersRound, label: 'Team', href: '/settings/team' },
    { icon: Settings, label: 'WhatsApp settings', href: '/settings/whatsapp' },
  ] },
];

export function Sidebar({
  quickStats = [],
}: {
  quickStats?: { label: string; value: string }[];
}) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="product-mark">CI</div>
        <div><div className="product-name">Customer Intelligence</div><div className="logo-console">Company Growth</div></div>
      </div>

      <nav className="nav" aria-label="Main navigation">
        {NAV.map((group) => <div className="nav-group" key={group.label}>
          <div className="nav-section-label">{group.label}</div>
          {group.items.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return <Link key={item.label} href={item.href} title={item.label} aria-current={active ? 'page' : undefined} className={`nav-item${active ? ' active' : ''}`}>
              <span className="nav-icon"><Icon size={18} strokeWidth={1.8} /></span>
              <span className="nav-label">{item.label}</span>
            </Link>;
          })}
        </div>)}
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
      <Link href="/saas" className="company-switch"><Building2 size={17} /><span><b>Company</b><small>Switch workspace</small></span></Link>
    </aside>
  );
}
