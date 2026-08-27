import { NextResponse } from 'next/server';
import { refreshAllPlayers } from '@/lib/player-activity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;


export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await refreshAllPlayers();
    return NextResponse.json({ ran: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ran: false, error: message }, { status: 500 });
  }
}
