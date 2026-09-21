'use client';

import { getSupabaseBrowser } from './supabase-browser';

/** Sign out of Supabase and return to the login page. */
export async function logout(): Promise<void> {
  await getSupabaseBrowser().auth.signOut();
  window.location.href = '/saas-login';
}
