// Load the backup JSON (from scripts/backup-supabase.mjs) into the NEW Supabase
// project. Point .env.local at the NEW project first, then run:
//   node --env-file=.env.local scripts/import-backup.mjs
//
// Idempotent for tables with a conflict key (safe to re-run at cutover).

import { readFileSync, readdirSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (point .env.local at the NEW project)');
  process.exit(1);
}

// table -> on_conflict key (null = plain insert; it's a log, new ids are fine)
const TABLES = {
  transactions: 'type,transaction_id,branch_id',
  message_log: 'event_key',
  app_settings: 'key',
  webhook_logs: null,
  analytics_events: null,
};

function latestFile(table) {
  let files = [];
  try { files = readdirSync('backups'); } catch { return null; }
  const matches = files.filter((f) => f.startsWith(`${table}-`) && f.endsWith('.json')).sort();
  return matches.length ? `backups/${matches[matches.length - 1]}` : null;
}

async function importTable(table, conflict) {
  const file = latestFile(table);
  if (!file) { console.warn(`⏭️  ${table}: no backup file, skipping`); return; }
  // Strip `id` — identity columns reject explicit ids; conflict keys handle dedupe.
  const rows = JSON.parse(readFileSync(file, 'utf8')).map(({ id, ...rest }) => rest);
  if (rows.length === 0) { console.log(`${table}: 0 rows`); return; }

  const url = conflict ? `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}` : `${SUPABASE_URL}/rest/v1/${table}`;
  const prefer = conflict ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal';

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: prefer },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`❌ ${table} batch @${i} failed ${res.status}: ${(await res.text()).slice(0, 250)}`);
      return;
    }
    console.log(`${table}: ${Math.min(i + 500, rows.length)}/${rows.length}`);
  }
  console.log(`✅ ${table} done (${rows.length} rows)`);
}

for (const [table, conflict] of Object.entries(TABLES)) {
  await importTable(table, conflict);
}
console.log('\nimport complete ✅');
