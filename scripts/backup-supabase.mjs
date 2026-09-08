// Full data backup via the service_role key — works even while locked out of the
// Supabase console. Dumps each table to backups/<table>-<date>.json.
//
// Run: node --env-file=.env.local scripts/backup-supabase.mjs

import { writeFileSync, mkdirSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Add/remove table names to match what you have.
const TABLES = [
  'users',
  'transactions',
  'message_log',
  'app_settings',
  'webhook_logs',
  'player_activity',
  'analytics_events',
];

async function fetchAll(table) {
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 150)}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

const stamp = new Date().toISOString().slice(0, 10);
mkdirSync('backups', { recursive: true });

for (const table of TABLES) {
  try {
    const rows = await fetchAll(table);
    writeFileSync(`backups/${table}-${stamp}.json`, JSON.stringify(rows, null, 2));
    console.log(`✅ ${table}: ${rows.length} rows -> backups/${table}-${stamp}.json`);
  } catch (err) {
    console.warn(`⚠️  ${table}: skipped (${err.message})`);
  }
}

console.log('\nBackup complete. Files are in the backups/ folder.');
