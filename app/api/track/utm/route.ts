import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Called cross-origin from the website, so allow CORS.
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function upsert(row: Record<string, unknown>): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  await fetch(`${SUPABASE_URL}/rest/v1/attribution?on_conflict=device_id`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  }).catch(() => {});
}

export async function POST(req: Request) {
  // Body is sent as text/plain (to avoid a CORS preflight); parse it ourselves.
  let body: Record<string, unknown>;
  try { body = JSON.parse((await req.text()) || '{}'); } catch { return NextResponse.json({ ok: false }, { status: 200, headers: CORS }); }

  const deviceId = String(body.device_id || '').slice(0, 100);
  if (!deviceId) return NextResponse.json({ ok: false }, { status: 200, headers: CORS });

  // identify: link this device to a logged-in user id
  if (body.identify && body.user_id) {
    await upsert({ device_id: deviceId, user_id: String(body.user_id).slice(0, 120) });
    return NextResponse.json({ ok: true }, { headers: CORS });
  }

  const first = (body.first && typeof body.first === 'object') ? body.first as Record<string, any> : null;
  const last = (body.last && typeof body.last === 'object') ? body.last as Record<string, any> : null;

  // Only include first_*/last_* when present, so a later beacon can't null them out.
  const row: Record<string, unknown> = { device_id: deviceId };
  if (first?.utm) {
    Object.assign(row, {
      first_source: first.utm.utm_source ?? null,
      first_medium: first.utm.utm_medium ?? null,
      first_campaign: first.utm.utm_campaign ?? null,
      first_landing: first.landing ?? null,
      first_referrer: first.referrer ?? null,
      first_at: first.at ?? null,
    });
  }
  if (last?.utm) {
    Object.assign(row, {
      last_source: last.utm.utm_source ?? null,
      last_medium: last.utm.utm_medium ?? null,
      last_campaign: last.utm.utm_campaign ?? null,
      last_landing: last.landing ?? null,
      last_referrer: last.referrer ?? null,
      last_at: last.at ?? null,
    });
  }

  await upsert(row);
  return NextResponse.json({ ok: true }, { headers: CORS });
}
