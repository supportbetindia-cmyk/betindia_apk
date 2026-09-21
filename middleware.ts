import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  // Supabase Auth is the only login. No session → redirect to /saas-login.
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
      if (data.user) return res; // authenticated; res carries refreshed cookies
    } catch {
      /* fall through to unauthenticated handling */
    }
  }

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const redirect = req.nextUrl.clone();
  redirect.pathname = '/saas-login';
  return NextResponse.redirect(redirect);
}

export const config = {
  matcher: ['/((?!saas-login|saas-signup|saas|customers|overview|targets|profit|api/saas|api/wati|api/cron|api/track|utm.js|bettracker.inject.js|_next/static|_next/image|favicon.ico).*)'],
};
