import { NextResponse } from 'next/server';
import { checkPassword, createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

export async function POST(req: Request) {
  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), sessionCookieOptions);
  return res;
}
