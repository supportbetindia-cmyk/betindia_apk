// Send a re-engagement campaign (win-back or first-deposit) from your user file.
// SAFE BY DEFAULT: dry-run unless you pass --send.
//
// Dry run (no messages, no key needed):
//   node --env-file=.env.local --experimental-strip-types scripts/send-campaign.mjs users.csv --audience=winback
// Real send (needs INTERAKT_CAMPAIGN_API_KEY + an approved template):
//   node --env-file=.env.local --experimental-strip-types scripts/send-campaign.mjs users.csv --audience=winback --limit=100 --send

import { readFileSync } from 'node:fs';
import { parseUsersCsv } from './parse-users.mjs';
import { buildReengagementSegment, DEFAULT_CAMPAIGN_CONFIG } from '../lib/reengagement.ts';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERAKT_KEY = process.env.INTERAKT_CAMPAIGN_API_KEY; // the 2nd (marketing) Interakt account

// The approved template names in the 2nd Interakt account. Override via env if different.
// IMPORTANT: bodyValues below must match the template's {{1}}, {{2}} variable order.
// Each audience -> its approved template name (the identifier from the Interakt
// URL app.interakt.ai/template/<name>/view) and the language it's registered in.
const TEMPLATES = {
  winback:       { name: process.env.WINBACK_TEMPLATE       || 'inactive_users', lang: process.env.WINBACK_LANG       || 'en' },
  first_deposit: { name: process.env.FIRST_DEPOSIT_TEMPLATE || 'quick_offer_',   lang: process.env.FIRST_DEPOSIT_LANG || 'hi' },
};

// All current templates use ONE variable: {{1}} = name. (Bonuses are baked into
// the template text, not passed as variables.)
function bodyValuesFor(c) {
  return [c.name || 'there'];
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const audience = args.find((a) => a.startsWith('--audience='))?.split('=')[1] || 'winback';
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '200');
const doSend = args.includes('--send');
const testPhone = args.find((a) => a.startsWith('--test='))?.split('=')[1];

if ((!file && !testPhone) || !['winback', 'first_deposit'].includes(audience)) {
  console.error('usage: ... send-campaign.mjs <users.csv> --audience=winback|first_deposit [--limit=N] [--send]');
  console.error('  test one number: ... --audience=winback --test=98XXXXXXXX --send');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function claimLog(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/message_log?on_conflict=event_key`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`log insert ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return (await res.json()).length > 0; // false = already logged (dedupe)
}

async function updateLog(eventKey, patch) {
  await fetch(`${SUPABASE_URL}/rest/v1/message_log?event_key=eq.${encodeURIComponent(eventKey)}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  }).catch(() => {});
}

async function sendInterakt(candidate) {
  const res = await fetch('https://api.interakt.ai/v1/public/message/', {
    method: 'POST',
    headers: { Authorization: `Basic ${INTERAKT_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      countryCode: '+91',
      phoneNumber: String(candidate.mobile).replace(/\D/g, '').slice(-10),
      type: 'Template',
      template: {
        name: TEMPLATES[candidate.audience].name,
        languageCode: TEMPLATES[candidate.audience].lang,
        bodyValues: bodyValuesFor(candidate),
      },
    }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok && j?.result !== false, id: j?.id, error: j?.message || (res.ok ? undefined : `HTTP ${res.status}`) };
}

// One-off test to your OWN number, to verify the template + key before a real batch.
if (testPhone) {
  if (!doSend) {
    console.log(`DRY RUN — would test-send the "${audience}" template to ${testPhone}. Add --send.`);
    process.exit(0);
  }
  if (!INTERAKT_KEY) { console.error('INTERAKT_CAMPAIGN_API_KEY is not set — cannot send.'); process.exit(1); }
  const bonus = audience === 'winback' ? DEFAULT_CAMPAIGN_CONFIG.winbackBonus : DEFAULT_CAMPAIGN_CONFIG.firstDepositBonus;
  const r = await sendInterakt({ mobile: testPhone, name: 'Test', bonus, audience });
  console.log('test send result:', r);
  process.exit(r.ok ? 0 : 1);
}

const users = parseUsersCsv(readFileSync(file, 'utf8'));
const seg = await buildReengagementSegment(users, DEFAULT_CAMPAIGN_CONFIG);
const pool = audience === 'first_deposit' ? seg.firstDeposit : seg.winback;
const batch = pool.slice(0, limit);

console.log(`\naudience=${audience}  eligible=${pool.length}  this run=${batch.length}  mode=${doSend ? 'SEND' : 'DRY-RUN'}`);

if (!doSend) {
  console.log('sample:', batch.slice(0, 5));
  console.log('\nDRY RUN — nothing sent. Add --send (and set INTERAKT_CAMPAIGN_API_KEY) to send for real.\n');
  process.exit(0);
}

if (!INTERAKT_KEY) { console.error('INTERAKT_CAMPAIGN_API_KEY is not set — cannot send.'); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
let sent = 0, failed = 0, skipped = 0;

for (const c of batch) {
  const eventKey = `${c.audience}:${c.user_id}:${today}`;
  let claimed;
  try {
    claimed = await claimLog({
      event_key: eventKey, channel: 'whatsapp', template: TEMPLATES[c.audience].name,
      event_type: c.audience, user_id: c.user_id, mobile: c.mobile,
      status: 'processing', detail: 'campaign send',
    });
  } catch (err) { console.error('log error', err.message); failed++; continue; }

  if (!claimed) { skipped++; continue; } // already messaged today

  const r = await sendInterakt(c);
  await updateLog(eventKey, r.ok
    ? { status: 'sent', detail: `campaign ${c.audience} ₹${c.bonus}` }
    : { status: 'failed', detail: 'campaign send failed', last_error: r.error ?? 'send failed' });
  if (r.ok) sent++; else failed++;
  await sleep(250); // gentle rate limit
}

console.log(`\ndone — sent=${sent} failed=${failed} skipped(already messaged)=${skipped}\n`);
