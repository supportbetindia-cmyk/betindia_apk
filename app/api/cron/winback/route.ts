import { NextResponse } from 'next/server';
import { osConfigured, sendToInactive } from '@/lib/onesignal';

export const dynamic = 'force-dynamic';

// Daily win-back: push a re-engagement message to users who haven't opened the
// app in N days. Triggered by Vercel Cron (see vercel.json). Vercel sends
// `Authorization: Bearer <CRON_SECRET>` on cron requests when CRON_SECRET is
// set — we verify it so nobody else can trigger real sends.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!osConfigured()) {
    return NextResponse.json({ error: 'OneSignal not configured' }, { status: 503 });
  }

  const daysInactive = Number(process.env.WINBACK_INACTIVE_DAYS) || 7;
  const title = process.env.WINBACK_TITLE || 'We miss you! 🎰';
  const message = process.env.WINBACK_MESSAGE || 'Come back and claim your welcome bonus 🎁';
  const url = process.env.WINBACK_URL || undefined;

  const result = await sendToInactive({ daysInactive, title, message, url });
  return NextResponse.json({ ran: true, daysInactive, ...result });
}
