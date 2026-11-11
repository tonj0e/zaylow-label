import { supabase } from './supabase';

/**
 * People sign in with a username and a password. Supabase wants an email, so a plain username
 * becomes username@zaylow.app. (Someone who types a full email address is let through as it is.)
 */
export const toLoginEmail = (username: string) => {
  const u = username.trim().toLowerCase();
  return u.includes('@') ? u : `${u}@zaylow.app`;
};

export const AuthService = {
  async signIn(username: string, password: string): Promise<{ ok: boolean; message?: string }> {
    if (!username.trim() || !password) return { ok: false, message: 'Enter your username and password.' };
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(username), password });
      if (!error) return { ok: true };
      if (/invalid login/i.test(error.message)) return { ok: false, message: 'The username or password is not right.' };
      if (/rate|too many/i.test(error.message)) return { ok: false, message: 'Too many tries. Wait a minute and try again.' };
      if (/confirm/i.test(error.message)) return { ok: false, message: 'This account is not confirmed yet. Ask the owner to confirm it.' };
      return { ok: false, message: error.message };
    } catch {
      return { ok: false, message: 'Could not reach the server. Check the internet and try again.' };
    }
  },
  async signOut() { try { await supabase.auth.signOut(); } catch { /* the page reloads either way */ } },
  username(email?: string | null) { return (email || '').replace(/@zaylow\.app$/i, ''); },
};
