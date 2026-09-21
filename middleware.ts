import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  // 1) Legacy password session — the guaranteed path. Unchanged. If this passes,
  //    we never touch Supabase, so the existing login can never break.
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next();

  // 2) Supabase Auth session (additive). Any failure falls through to redirect,
  //    so a bug here can only deny the Supabase path — never the password path.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const res = NextResponse.next({ request: req });
      const supabase = createServerClient(url, anon, {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
          },
        },
      });
      const { data } = await supabase.auth.getUser();
      if (data.user) return res; // authenticated via Supabase; res carries refreshed cookies
    } catch {
      /* fall through to unauthenticated handling */
    }
  }

  // 3) Not authenticated by either method.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const redirect = req.nextUrl.clone();
  redirect.pathname = '/login';
  return NextResponse.redirect(redirect);
}


export const config = {
  matcher: ['/((?!login|saas-login|saas|customers|overview|targets|profit|api/saas|api/login|api/wati|api/cron|api/track|utm.js|bettracker.inject.js|_next/static|_next/image|favicon.ico).*)'],
};
