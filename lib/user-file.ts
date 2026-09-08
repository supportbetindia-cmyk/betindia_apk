// Browser + server safe parser: delimited text -> user rows. No `fs`, so it can
// run inside a client component (the admin uploads the CSV in the browser).
// Mirrors scripts/parse-users.mjs (kept in sync intentionally).

import type { UserInput } from './reengagement';

export type ParsedUser = UserInput & { raw: Record<string, string> };

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 10);
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const line of lines) for (const ch of line) if (ch in counts) counts[ch]++;
  let best = ',', max = 0;
  for (const [d, n] of Object.entries(counts)) if (n > max) { max = n; best = d; }
  return best;
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function findHeaderIndex(rows: string[][]): number {
  return rows.findIndex((r) => r.some((cell) => cell.replace(/^﻿/, '').trim().toLowerCase() === 'user_id'));
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

function toObjects(rows: string[][]): Record<string, string>[] {
  const [header, ...data] = rows;
  const keys = header.map((h) => h.replace(/^﻿/, '').trim());
  return data
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

function mapRow(record: Record<string, string>): ParsedUser | null {
  const userId = (record.User_ID || '').trim();
  if (!userId || /^(total|user_id)$/i.test(userId)) return null;
  return {
    user_id: userId,
    branch_id: record.Branch_ID || null,
    mobile: record.Phone_Number || null,
    name: record.Name || null,
    language: record.Language || null,
    register_date: parseDate(record.Register_Date),
    raw: record,
  };
}

/** Full pipeline: raw file text -> user rows (delimiter auto-detected, title rows skipped). */
export function parseUsersCsv(text: string): ParsedUser[] {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  const headerIdx = findHeaderIndex(rows);
  const fromHeader = headerIdx >= 0 ? rows.slice(headerIdx) : rows;
  return toObjects(fromHeader).map(mapRow).filter((r): r is ParsedUser => r !== null && Boolean(r.user_id));
}
