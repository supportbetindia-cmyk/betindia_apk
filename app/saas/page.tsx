'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, Check, LogOut, Plus } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import {
  backendRequest,
  clearSelectedTenantId,
  getSelectedTenantId,
  setSelectedTenantId,
  type BackendMe,
  type BackendTenant,
} from '@/lib/backend-api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; me: BackendMe; selectedTenantId: string | null };

// Proves the full chain: Supabase login → token → verified → tenant membership.
export default function SaasHome() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [companyName, setCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await backendRequest<BackendMe>('/me', { tenantId: null });
        const saved = getSelectedTenantId();
        const selectedTenantId = me.tenants.some((tenant) => tenant.id === saved)
          ? saved
          : me.tenants[0]?.id ?? null;
        if (selectedTenantId) setSelectedTenantId(selectedTenantId);
        setState({ status: 'ready', me, selectedTenantId });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not connect to the backend';
        if (message.toLowerCase().includes('session')) router.replace('/saas-login');
        else setState({ status: 'error', message });
      }
    })();
  }, [router]);

  async function signOut() {
    clearSelectedTenantId();
    await getSupabaseBrowser().auth.signOut();
    router.replace('/saas-login');
  }

  function selectTenant(tenant: BackendTenant) {
    setSelectedTenantId(tenant.id);
    setState((current) => current.status === 'ready'
      ? { ...current, selectedTenantId: tenant.id }
      : current);
  }

  async function createFirstCompany(event: React.FormEvent) {
    event.preventDefault();
    const name = companyName.trim();
    if (!name || state.status !== 'ready') return;
    setCreatingCompany(true);
    setCreateError(null);
    try {
      const tenant = await backendRequest<{ id: string }>('/tenants', {
        method: 'POST',
        tenantId: null,
        body: JSON.stringify({ name, timezone: 'Asia/Kolkata', currency: 'INR' }),
      });
      const me = await backendRequest<BackendMe>('/me', { tenantId: null });
      setSelectedTenantId(tenant.id);
      setState({ status: 'ready', me, selectedTenantId: tenant.id });
      setCompanyName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the company');
    } finally {
      setCreatingCompany(false);
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <div className="workspace-brand"><span>CI</span><div><b>Customer Intelligence</b><small>Company Growth</small></div></div>
        <button className="workspace-signout" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </header>

      <section className="workspace-content">
        <div className="workspace-intro"><p>Company workspace</p><h1>Where would you like to work?</h1><span>Choose a company to open its customers, transactions and reports.</span></div>

        {state.status === 'loading' ? <div className="workspace-loading">Loading your companies…</div> : null}
        {state.status === 'error' ? <div className="workspace-error" role="alert">{state.message}</div> : null}

        {state.status === 'ready' ? <>
          <div className="workspace-account"><span>Signed in as</span><b>{state.me.user.email}</b></div>
          {state.me.tenants.length ? <div className="workspace-grid">
            {state.me.tenants.map((tenant) => {
              const selected = state.selectedTenantId === tenant.id;
              return <button key={tenant.id} type="button" className={`workspace-card${selected ? ' selected' : ''}`} onClick={() => selectTenant(tenant)}>
                <span className="workspace-company-icon"><Building2 size={22} /></span>
                <span className="workspace-company"><b>{tenant.name}</b><small>{tenant.role.toLowerCase()}</small></span>
                <span className="workspace-check">{selected ? <Check size={16} /> : null}</span>
              </button>;
            })}
          </div> : <form className="workspace-create" onSubmit={createFirstCompany}>
            <span className="workspace-company-icon"><Plus size={22} /></span>
            <div><h2>Create your first company</h2><p>You will be assigned as the company owner.</p></div>
            <label htmlFor="company-name">Company name</label>
            <input id="company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Example: BetIndia" required maxLength={120} />
            {createError ? <div className="workspace-error" role="alert">{createError}</div> : null}
            <button type="submit" disabled={creatingCompany || !companyName.trim()}>{creatingCompany ? 'Creating…' : 'Create company'} <ArrowRight size={16} /></button>
          </form>}

          {state.selectedTenantId ? <div className="workspace-actions">
            <p><Check size={15} /> Workspace selected</p>
            <button onClick={() => router.push('/overview')}>Continue to overview <ArrowRight size={16} /></button>
          </div> : null}
        </> : null}
      </section>
    </main>
  );
}
