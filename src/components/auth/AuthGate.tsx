import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { AuthService } from '../../services/authService';

/** Nothing in the app is shown until someone has signed in. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setChecking(false); } }).catch(() => { if (alive) setChecking(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setChecking(false); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const r = await AuthService.signIn(username, password);
    if (!r.ok) { setError(r.message || 'Could not sign in.'); setPassword(''); }
    setBusy(false);
  };

  if (session) return <>{children}</>;

  return (
    <div className="kdash min-h-screen grid place-items-center p-4" style={{ background: 'var(--bg, #f0f2ee)' }}>
      {checking ? (
        <Loader2 className="w-6 h-6 animate-spin" aria-label="Checking your sign-in" />
      ) : (
        <main className="k-card w-full max-w-sm p-6 md:p-8 space-y-6 k-rise">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 100 100" className="w-10 h-10" aria-hidden="true">
              <path d="M50 42 C50 42 50 25 38 18 C26 11 15 23 22 37 C29 51 45 49 50 42Z" fill="currentColor" />
              <path d="M58 50 C58 50 75 50 82 38 C89 26 77 15 63 22 C49 29 51 45 58 50Z" fill="currentColor" />
              <path d="M50 58 C50 58 50 75 62 82 C74 89 85 77 78 63 C71 49 55 51 50 58Z" fill="currentColor" />
              <path d="M42 50 C42 50 25 50 18 62 C11 74 23 85 37 78 C51 71 49 55 42 50Z" fill="currentColor" />
            </svg>
            <div><h1 className="text-2xl font-bold k-display leading-none">ZAYLOW</h1><p className="text-sm k-muted mt-1">Warehouse sign in</p></div>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="lg-user" className="k-label">Username</label>
              <div className="relative">
                <User className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input id="lg-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus className="k-field" style={{ paddingLeft: '2.4rem' }} />
              </div>
            </div>
            <div>
              <label htmlFor="lg-pass" className="k-label">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input id="lg-pass" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="k-field" style={{ paddingLeft: '2.4rem', paddingRight: '2.8rem' }} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 k-muted">{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            {error && <p role="alert" className="text-sm font-medium rounded-2xl px-4 py-3" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>{error}</p>}
            <button type="submit" disabled={busy} className="k-btn k-btn-lime w-full py-3 text-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="text-xs k-muted">Accounts are made by the owner. Forgot your password? Ask the owner to reset it.</p>
        </main>
      )}
    </div>
  );
};
