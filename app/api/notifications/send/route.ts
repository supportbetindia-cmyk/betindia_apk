import { NextResponse } from 'next/server';
import { osConfigured, createNotification } from '@/lib/onesignal';

export const dynamic = 'force-dynamic';

// Sends a real push to real devices. Protected by the auth middleware; the
// dashboard UI additionally requires an explicit confirm before calling this.
export async function POST(req: Request) {
  if (!osConfigured()) {
    return NextResponse.json({ error: 'OneSignal not configured' }, { status: 503 });
  }

  let body: { title?: string; message?: string; segment?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const title = (body.title ?? '').trim();
  const message = (body.message ?? '').trim();
  const segment = (body.segment ?? '').trim() || 'Subscribed Users';
  const url = (body.url ?? '').trim() || undefined;

  if (!title || !message) {
    return NextResponse.json({ error: 'Title and message are required' }, { status: 400 });
  }

  try {
    const result = await createNotification({ title, message, segment, url });
    return NextResponse.json({ ok: true, id: result.id, recipients: result.recipients });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
