import Link from 'next/link';
import { BarChart3, ShieldCheck, Workflow } from 'lucide-react';

export function SaasAuthShell({ title, subtitle, alternate, children }: {
  title: string;
  subtitle: string;
  alternate: { prompt: string; label: string; href: string };
  children: React.ReactNode;
}) {
  return <main className="saas-auth">
    <section className="saas-auth-story">
      <Link href="/saas-login" className="saas-auth-brand"><span>CI</span><div><b>Customer Intelligence</b><small>Company Growth</small></div></Link>
      <div className="saas-auth-message">
        <p className="saas-auth-eyebrow">One clear operating view</p>
        <h1>Know every customer.<br />Grow with confidence.</h1>
        <p>Customers, transactions, communication and company performance—securely separated for every business.</p>
        <ul>
          <li><BarChart3 size={18} /><span><b>Understand performance</b><small>Traceable KPIs and period comparisons</small></span></li>
          <li><Workflow size={18} /><span><b>Automate engagement</b><small>Live transaction events and customer journeys</small></span></li>
          <li><ShieldCheck size={18} /><span><b>Built for multiple companies</b><small>Tenant isolation, roles and audit history</small></span></li>
        </ul>
      </div>
      <p className="saas-auth-copyright">Customer Intelligence and Company Growth</p>
    </section>
    <section className="saas-auth-form-wrap">
      <div className="saas-auth-card">
        <div className="saas-auth-mobile-brand"><span>CI</span><b>Customer Intelligence</b></div>
        <div className="saas-auth-heading"><h2>{title}</h2><p>{subtitle}</p></div>
        {children}
        <p className="saas-auth-alternate">{alternate.prompt} <Link href={alternate.href}>{alternate.label}</Link></p>
      </div>
    </section>
  </main>;
}
