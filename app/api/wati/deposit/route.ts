import { NextResponse } from 'next/server';
import { saveTransaction, parseWebhookBody, logWebhookHit } from '@/lib/wati';
import { queueTransactionAutomation } from '@/lib/automations';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ct = req.headers.get('content-type') || 'none';
  const ip = req.headers.get('x-forwarded-for');
  const token = new URL(req.url).searchParams.get('token');
  const tokenOk = Boolean(process.env.WATI_WEBHOOK_SECRET) && token === process.env.WATI_WEBHOOK_SECRET;

  console.log(`[wati/deposit] hit content-type=${ct} tokenOk=${tokenOk}`);

  if (!tokenOk) {
    await logWebhookHit({ source: 'deposit', method: 'POST', contentType: ct, tokenOk, status: 401, ip });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await parseWebhookBody(req);
  console.log('[wati/deposit] fields:', Object.keys(body).join(','));

  try {
    await saveTransaction('deposit', body);
    await logWebhookHit({ source: 'deposit', method: 'POST', contentType: ct, tokenOk, status: 200, ip, raw: body });
    // Best-effort: a queue error must never fail the webhook ack or trigger retries.
    try {
      await queueTransactionAutomation('deposit', body);
    } catch (autoErr) {
      console.error('[wati/deposit] automation queue failed:', autoErr);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logWebhookHit({ source: 'deposit', method: 'POST', contentType: ct, tokenOk, status: 500, ip, raw: body });
    console.error('[wati/deposit] save failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
