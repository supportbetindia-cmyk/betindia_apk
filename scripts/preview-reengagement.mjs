// Preview the re-engagement audiences from your USER FILE + Supabase transactions,
// entirely locally. No Supabase console and no `users` table needed — the user
// list is read from the CSV you export from Excel.
//
// Run: node --env-file=.env.local --experimental-strip-types scripts/preview-reengagement.mjs users.csv

import { readFileSync } from 'node:fs';
import { parseUsersCsv, debugHeaders, detectDelimiter } from './parse-users.mjs';
import { buildReengagementSegment, DEFAULT_CAMPAIGN_CONFIG } from '../lib/reengagement.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: node --env-file=.env.local --experimental-strip-types scripts/preview-reengagement.mjs <users.csv>');
  process.exit(1);
}

const text = readFileSync(file, 'utf8');
const users = parseUsersCsv(text);
console.log(`\nloaded ${users.length} users from ${file}`);

if (users.length === 0) {
  console.error(`\nNo users parsed. Detected delimiter: ${JSON.stringify(detectDelimiter(text))}`);
  console.error('Detected columns:', debugHeaders(text));
  console.error('Expected a "User_ID" column. If the columns above look merged into one, the delimiter is wrong; if the name differs, tell me the exact header.\n');
  process.exit(1);
}

const seg = await buildReengagementSegment(users, DEFAULT_CAMPAIGN_CONFIG);

console.log('\n=== Re-engagement preview ===');
console.log('config:', DEFAULT_CAMPAIGN_CONFIG);
console.log('\ncounts:', seg.counts);
console.log('\ntotal bonus if all sent: ₹' + seg.totalBonus.toLocaleString());
console.log('\nwin-back sample:', seg.winback.slice(0, 5));
console.log('\nfirst-deposit sample:', seg.firstDeposit.slice(0, 5));
console.log('\n(nothing was sent — preview only)\n');
