'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { SaasAuthShell } from '@/components/SaasAuthShell';

// Self-service sign-up (Supabase Auth). Note: a new account still needs a tenant
// membership before it can see any company data (owner/admin invites them, or the
// first owner is linked via SQL). If the Supabase project requires email
// confirmation, the user must confirm before they can sign in.
export default function SaasSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      if (data.session) {
        router.replace('/saas'); // email confirmation is OFF → signed in immediately
      } else {
        setNotice('Account created. Check your email to confirm, then sign in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SaasAuthShell title="Create your account" subtitle="Start your company workspace in a few seconds." alternate={{ prompt: 'Already have an account?', label: 'Sign in', href: '/saas-login' }}>
      <form className="saas-auth-form" onSubmit={submit}>
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" minLength={6} required />
        </label>

        <p className="saas-auth-hint">Use at least 6 characters.</p>
        {error ? <div className="saas-auth-alert error" role="alert">{error}</div> : null}
        {notice ? <div className="saas-auth-alert success" role="status">{notice}</div> : null}

        <button className="saas-auth-submit" type="submit" disabled={loading}>
          {loading ? 'Creating…' : <>Create account <ArrowRight size={16} /></>}
        </button>

      </form>
    </SaasAuthShell>
  );
}
