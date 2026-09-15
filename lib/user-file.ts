// Browser + server safe parser: delimited text -> user rows. No `fs`, so it can
// run inside a client component (the admin uploads the CSV in the browser).
// Mirrors scripts/parse-users.mjs (kept in sync intentionally).

import type { UserInput } from './reengagement';

export type ReportFinancials = {
  first_deposit_date: string | null;
  first_deposit_amount: number | null;
  last_deposit_date: string | null;
  last_deposit_amount: number | null;
  last_withdrawal_date: string | null;
  last_withdrawal_amount: number | null;
  total_deposit: number | null;
  deposit_count: number | null;
  total_withdrawal: number | null;
  withdrawal_count: number | null;
  pnl: number | null;
  total_bonus: number | null;
  status_label: string | null;
  category: string | null;
};

export type ParsedUser = UserInput & {
  raw: Record<string, string>;
  // Present when the file is a CRM / User Master report with lifetime financials.
  report?: ReportFinancials;
};

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

// The header cell may be "User_ID", "User ID", or "UserID" depending on export.
const USER_ID_HEADER = /^user[\s_]*id$/i;

function findHeaderIndex(rows: string[][]): number {
  return rows.findIndex((r) => r.some((cell) => USER_ID_HEADER.test(cell.replace(/^﻿/, '').trim())));
}

/** Case/space-insensitive field lookup: "Register_Date" and "Registered at" both work. */
function field(record: Record<string, string>, ...candidates: RegExp[]): string {
  for (const key of Object.keys(record)) {
    if (candidates.some((re) => re.test(key.trim()))) {
      const v = (record[key] ?? '').trim();
      if (v) return v;
    }
  }
  return '';
}

/** True if the record has any column whose name matches one of the patterns. */
function hasKey(record: Record<string, string>, ...candidates: RegExp[]): boolean {
  return Object.keys(record).some((k) => candidates.some((re) => re.test(k.trim())));
}

/** Parse a number that may carry commas, currency or spaces. */
function num(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[,\s₹]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function reportFrom(record: Record<string, string>): ReportFinancials {
  return {
    first_deposit_date: parseDate(field(record, /^first[\s_]*deposit[\s_]*date$/i, /^first[\s_]*known[\s_]*approved[\s_]*deposit[\s_]*date$/i)),
    first_deposit_amount: num(field(record, /^first[\s_]*deposit[\s_]*amount$/i)),
    last_deposit_date: parseDate(field(record, /^last[\s_]*deposit[\s_]*date$/i)),
    last_deposit_amount: num(field(record, /^last[\s_]*deposit[\s_]*amount$/i)),
    last_withdrawal_date: parseDate(field(record, /^last[\s_]*withdrawal[\s_]*date$/i)),
    last_withdrawal_amount: num(field(record, /^last[\s_]*withdrawal[\s_]*amount$/i)),
    total_deposit: num(field(record, /^total[\s_]*deposit$/i, /^lifetime[\s_]*deposits$/i)),
    deposit_count: num(field(record, /total[\s_]*deposit[\s_]*count/i, /^lifetime[\s_]*deposit[\s_]*count$/i)),
    total_withdrawal: num(field(record, /^total[\s_]*withdrawal$/i, /^lifetime[\s_]*withdrawals$/i)),
    withdrawal_count: num(field(record, /total[\s_]*withdrawal[\s_]*count/i, /^lifetime[\s_]*withdrawal[\s_]*count$/i)),
    pnl: num(field(record, /^p\s*\/?\s*l$/i)),
    total_bonus: num(field(record, /^total[\s_]*bonus$/i, /^imported[\s_]*total[\s_]*bonus$/i)),
    status_label: field(record, /^status$/i, /^payment[\s_]*activity$/i) || null,
    category: field(record, /^category$/i, /^imported[\s_]*category$/i) || null,
  };
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
  const userId = field(record, USER_ID_HEADER);
  // Drop header echoes, "total" summary rows, and the export's "0.00E+00" / "0"
  // aggregate artifact. The decimal is required so real hex IDs like "0e5" survive.
  if (!userId || /^(total|user[\s_]*id)$/i.test(userId) || /^0$/.test(userId) || /^0\.0+(e[+-]?\d+)?$/i.test(userId)) return null;
  const isReport = hasKey(record, /first[\s_]*deposit[\s_]*amount/i, /total[\s_]*deposit[\s_]*count/i, /lifetime[\s_]*deposit[\s_]*count/i);
  return {
    user_id: userId,
    branch_id: field(record, /^branch[\s_]*id$/i) || null,
    mobile: field(record, /^phone[\s_]*number$/i, /^mobile$/i, /^phone$/i) || null,
    name: field(record, /^name$/i) || null,
    language: field(record, /^language$/i) || null,
    register_date: parseDate(field(record, /^regist(ration|er)?[\s_]*date$/i, /^registered[\s_]*at$/i)),
    raw: record,
    ...(isReport ? { report: reportFrom(record) } : {}),
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
