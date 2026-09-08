// Import the master user list (CSV) into a Supabase `users` table.
// (Only works once the `users` table exists — needs console/DDL access.)
// Run: node --env-file=.env.local scripts/import-users.mjs users.csv

import { readFileSync } from 'node:fs';
import { parseUsersCsv } from './parse-users.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function upsertUsers(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch.map((r) => ({ ...r, updated_at: new Date().toISOString() }))),
    });
    if (!res.ok) throw new Error(`upsert failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    console.log(`upserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node --env-file=.env.local scripts/import-users.mjs <file.csv>');
    process.exit(1);
  }
  const rows = parseUsersCsv(readFileSync(file, 'utf8'));
  console.log(`mapping ${rows.length} users`);
  if (rows.length === 0) {
    console.error('Nothing to import. Expected columns: User_ID, Branch_ID, Register_Date, Phone_Number, Name, Language, DOB, Location');
    process.exit(1);
  }
  await upsertUsers(rows);
  console.log('done ✅');
}

main().catch((err) => { console.error('import failed:', err); process.exit(1); });
