import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';


export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySession(token);
  if (authed) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

// Protect everything except the login page, the login API, the WATI webhooks
// (which are token-protected and called by the platform's server, not a
// logged-in browser), and static assets.
export const config = {
  matcher: ['/((?!login|api/login|api/wati|api/cron|bettracker.inject.js|_next/static|_next/image|favicon.ico).*)'],
};
