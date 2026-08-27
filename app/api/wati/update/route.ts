import { NextResponse } from 'next/server';
import { saveTransaction, parseWebhookBody, logWebhookHit, findTransactionType, type TxnType } from '@/lib/wati';
import { queueTransactionAutomation } from '@/lib/automations';

export const dynamic = 'force-dynamic';

/** Try to read deposit/withdrawal straight from the payload, if it says. */
function typeFromBody(body: Record<string, unknown>): TxnType | null {
  const raw = String(body.type ?? body.Type ?? body.transaction_type ?? body.txn_type ?? '').toLowerCase();
  if (raw.includes('deposit')) return 'deposit';
  if (raw.includes('withdraw')) return 'withdrawal';
  return null;
}

// Single "Transaction Update URL" for BOTH deposits and withdrawals. The platform
// only sends one endpoint, so we work out the type ourselves, then reuse the same
// upsert + automation path as the create webhooks.
export async function POST(req: Request) {
  const ct = req.headers.get('content-type') || 'none';
  const ip = req.headers.get('x-forwarded-for');
  const token = new URL(req.url).searchParams.get('token');
  const tokenOk = Boolean(process.env.WATI_WEBHOOK_SECRET) && token === process.env.WATI_WEBHOOK_SECRET;

  console.log(`[wati/update] hit content-type=${ct} tokenOk=${tokenOk}`);

  if (!tokenOk) {
    await logWebhookHit({ source: 'update', method: 'POST', contentType: ct, tokenOk, status: 401, ip });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await parseWebhookBody(req);
  const txnId = body.Transaction_id ?? body.transaction_id;

  // Resolve the type: 1) explicit field, 2) look up how we stored it on create,
  // 3) infer from bank fields (withdrawals carry account/IFSC, deposits don't).
  let type = typeFromBody(body);
  if (!type && txnId) {
    try { type = await findTransactionType(String(txnId)); } catch { /* fall through to inference */ }
  }
  if (!type) {
    const hasBankFields = Boolean(body.Account_number ?? body.account_number ?? body.Ifsc_code ?? body.ifsc_code);
    type = hasBankFields ? 'withdrawal' : 'deposit';
  }

  try {
    await saveTransaction(type, body);
    await logWebhookHit({ source: 'update', method: 'POST', contentType: ct, tokenOk, status: 200, ip, raw: body });
    // Best-effort: a queue error must never fail the webhook ack.
    try {
      await queueTransactionAutomation(type, body);
    } catch (autoErr) {
      console.error('[wati/update] automation queue failed:', autoErr);
    }
    return NextResponse.json({ ok: true, type });
  } catch (err) {
    await logWebhookHit({ source: 'update', method: 'POST', contentType: ct, tokenOk, status: 500, ip, raw: body });
    console.error('[wati/update] save failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
