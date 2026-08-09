// Minimal stateless session auth: a signed, expiring cookie.
//
// On login we issue `bt_session = <payload>.<hmac>`, where payload holds an
// expiry timestamp and the HMAC (keyed by SESSION_SECRET) proves the cookie
// was minted by us and not tampered with. Verification is pure crypto — no
// database or session store needed. Uses Web Crypto so it runs in both the
// Node route handlers and the edge middleware.

export const SESSION_COOKIE = 'bt_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const enc = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set in dashboard/.env.local');
  return secret;
}

function toB64Url(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return toB64Url(new Uint8Array(sig));
}

/** Constant-time-ish string compare to avoid signature timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a signed session token valid for SESSION_TTL_MS. */
export async function createSession(): Promise<string> {
  const payload = toB64Url(enc.encode(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })));
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

/** Verify a session token's signature and expiry. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;

  const expected = await hmac(payload);
  if (!safeEqual(sig, expected)) return false;

  try {
    const { exp } = JSON.parse(new TextDecoder().decode(fromB64Url(payload)));
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

/** Check a submitted password against ADMIN_PASSWORD (constant-time). */
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (!expected) return false;
  return safeEqual(input, expected);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_MS / 1000,
};
