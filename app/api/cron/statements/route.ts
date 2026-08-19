import { NextResponse } from 'next/server';
import { syncNextStatementBatch } from '@/lib/statement-sync';
import { isStatementEnabled } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Continue the durable statement sync even when nobody has the dashboard open. */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isStatementEnabled())) {
    return NextResponse.json({ ran: false, skipped: true, reason: 'statement sync disabled from dashboard' });
  }

  try {
    const result = await syncNextStatementBatch({ force: true });
    return NextResponse.json({ ran: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ran: false, error: message }, { status: 500 });
  }
}

