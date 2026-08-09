'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace('/');
        router.refresh();
      } else {
        setError(res.status === 401 ? 'Incorrect password' : 'Login failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="login-mark"><LockKeyhole size={18} /></div>
          <div>
            <h1>BetIndia Operations</h1>
            <span>Analytics Console</span>
          </div>
        </div>
        <p className="login-sub">Sign in to access business analytics and customer operations.</p>

        <label className="login-label" htmlFor="pw">
          Password
        </label>
        <input
          id="pw"
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />

        {error ? <div className="login-error">{error}</div> : null}

        <button className="login-btn" type="submit" disabled={loading || !password}>
          <span>{loading ? 'Signing in…' : 'Sign in'}</span>
          {!loading ? <ArrowRight size={16} /> : null}
        </button>
      </form>
    </div>
  );
}
