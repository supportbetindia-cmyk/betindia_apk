import { NextResponse } from 'next/server';
import { fetchWebhookLogs } from '@/lib/wati';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const logs = await fetchWebhookLogs(50);
    return NextResponse.json({ configured: true, logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404/i.test(message);
    return NextResponse.json({ configured: !needsSetup, error: message }, { status: needsSetup ? 200 : 500 });
  }
}
