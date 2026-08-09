import { NextResponse } from 'next/server';
import { interaktConfigured, sendWhatsAppTemplate } from '@/lib/interakt';
import { getSegments, type SegmentKey } from '@/lib/segments';

export const dynamic = 'force-dynamic';

const MAX_RECIPIENTS = 100; // guard against timeouts / accidental mass-blasts
const CHUNK = 10; // concurrency

type Target = { mobile: string; name: string | null };

/** Replace {{name}} tokens in body values per recipient. */
function personalize(values: string[], name: string | null): string[] {
  return values.map((v) => v.replace(/\{\{\s*name\s*\}\}/gi, name ?? 'there'));
}

export async function POST(req: Request) {
  if (!interaktConfigured()) {
    return NextResponse.json({ error: 'Interakt not configured' }, { status: 503 });
  }

  let body: {
    templateName?: string;
    languageCode?: string;
    bodyValues?: string[];
    segment?: SegmentKey;
    phone?: string;
    countryCode?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const templateName = (body.templateName ?? '').trim();
  if (!templateName) return NextResponse.json({ error: 'templateName is required' }, { status: 400 });

  // Resolve recipients: either one phone, or all users in a segment.
  let targets: Target[] = [];
  if (body.phone) {
    targets = [{ mobile: body.phone.trim(), name: null }];
  } else if (body.segment) {
    const segments = await getSegments();
    const seg = segments.find((s) => s.key === body.segment);
    if (!seg) return NextResponse.json({ error: 'unknown segment' }, { status: 400 });
    targets = seg.users
      .filter((u) => u.mobile)
      .map((u) => ({ mobile: u.mobile as string, name: u.userName }));
  } else {
    return NextResponse.json({ error: 'provide a segment or a phone' }, { status: 400 });
  }

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, note: 'no recipients in target' });
  }
  const capped = targets.slice(0, MAX_RECIPIENTS);

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  // Send in small concurrent chunks.
  for (let i = 0; i < capped.length; i += CHUNK) {
    const batch = capped.slice(i, i + CHUNK);
    const results = await Promise.all(
      batch.map((t) =>
        sendWhatsAppTemplate({
          phoneNumber: t.mobile,
          countryCode: body.countryCode ?? '+91',
          templateName,
          languageCode: body.languageCode ?? 'en',
          bodyValues: personalize(body.bodyValues ?? [], t.name),
        })
      )
    );
    for (const r of results) {
      if (r.ok) sent += 1;
      else {
        failed += 1;
        if (r.error && errors.length < 5) errors.push(r.error);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    total: targets.length,
    capped: targets.length > MAX_RECIPIENTS ? MAX_RECIPIENTS : undefined,
    errors,
  });
}
