'use client';

import { useEffect, useState } from 'react';
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
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Invite/recovery links redirect here with a one-time session in the URL. When
  // we detect that marker we show a "set your password" form instead of login, so
  // the invited user can turn that one-time session into a reusable password.
  const [acceptInvite, setAcceptInvite] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // GoTrue's invite/recovery links redirect here with the session as implicit tokens
    // in the URL hash (#access_token=...&type=invite). The PKCE client won't pick those
    // up on its own, so parse them and set the session explicitly.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const type = params.get('type');
    const errorDescription = params.get('error_description');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (errorDescription) { setAcceptInvite(true); setError(decodeURIComponent(errorDescription)); return; }
    if (/^(invite|recovery|signup)$/.test(type ?? '') || (accessToken && refreshToken)) {
      setAcceptInvite(true);
      if (accessToken && refreshToken) {
        getSupabaseBrowser().auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch(() => undefined);
      }
    }
  }, []);

  async function login(e: React.FormEvent) {
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

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      // The invite link already signed them in for this one session; confirm it
      // landed before trying to set the password (links expire / can be reused).
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('This invite link has expired. Ask for a new invitation.'); return; }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setError(error.message); return; }
      router.replace('/saas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set password');
    } finally {
      setLoading(false);
    }
  }

  if (acceptInvite) {
    return (
      <SaasAuthShell title="Set your password" subtitle="Create a password to finish joining your company workspace.">
        <form className="saas-auth-form" onSubmit={setNewPassword}>
          <label>
            <span>New password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
          </label>
          <label>
            <span>Confirm password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
          </label>

          {error ? <div className="saas-auth-alert error" role="alert">{error}</div> : null}

          <button className="saas-auth-submit" type="submit" disabled={loading}>
            {loading ? 'Saving…' : <>Set password &amp; continue <ArrowRight size={16} /></>}
          </button>
        </form>
      </SaasAuthShell>
    );
  }

  return (
    <SaasAuthShell title="Welcome back" subtitle="Sign in to continue to your company workspace." alternate={{ prompt: 'New to the platform?', label: 'Create an account', href: '/saas-signup' }}>
      <form className="saas-auth-form" onSubmit={login}>
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
