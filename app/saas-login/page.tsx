'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { SaasAuthShell } from '@/components/SaasAuthShell';

// Supabase-Auth login for the multi-tenant SaaS. Separate from the existing
// shared-password login so nothing breaks during the transition.
export default function SaasLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      router.replace('/saas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SaasAuthShell title="Welcome back" subtitle="Sign in to continue to your company workspace." alternate={{ prompt: 'New to the platform?', label: 'Create an account', href: '/saas-signup' }}>
      <form className="saas-auth-form" onSubmit={submit}>
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
        </label>

        {error ? <div className="saas-auth-alert error" role="alert">{error}</div> : null}

        <button className="saas-auth-submit" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : <>Sign in <ArrowRight size={16} /></>}
        </button>

      </form>
    </SaasAuthShell>
  );
}
