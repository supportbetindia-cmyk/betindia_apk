// Shared parser: delimited text -> array of user rows. Auto-detects whether the
// file is comma-, semicolon-, or tab-separated (Excel's CSV export varies by
// region). Used by both the import script and the local re-engagement preview.

// Sample the first several non-empty lines and pick whichever delimiter appears
// most (more robust than one line, since a title row may have few delimiters).
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 10);
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const line of lines) for (const ch of line) if (ch in counts) counts[ch]++;
  let best = ',', max = 0;
  for (const [d, n] of Object.entries(counts)) if (n > max) { max = n; best = d; }
  return best;
}

// Report exports often have a title/blank rows before the real header. Find the
// row that actually contains the "User_ID" column.
function findHeaderIndex(rows) {
  return rows.findIndex((r) => r.some((cell) => cell.replace(/^﻿/, '').trim().toLowerCase() === 'user_id'));
}

export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let field = '', row = [], inQuotes = false;
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

// Strip Excel's BOM off the first header so "User_ID" isn't read as "﻿User_ID".
export function toObjects(rows) {
  const [header, ...data] = rows;
  const keys = header.map((h) => h.replace(/^﻿/, '').trim());
  return data
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function parseDate(value) {
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

export function mapRow(record) {
  const userId = (record.User_ID || '').trim();
  // Skip blanks and any stray header/summary rows ("TOTAL").
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

// Return the detected header names — for diagnosing a "0 users" result.
export function debugHeaders(text) {
  const rows = parseCsv(text, detectDelimiter(text));
  const idx = findHeaderIndex(rows);
  return (rows[idx >= 0 ? idx : 0] ?? []).map((h) => h.replace(/^﻿/, '').trim());
}

/** Full pipeline: raw text -> array of mapped user rows. Auto-detects the
 * delimiter and skips any title/preamble rows before the real header. */
export function parseUsersCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  const headerIdx = findHeaderIndex(rows);
  const fromHeader = headerIdx >= 0 ? rows.slice(headerIdx) : rows;
  return toObjects(fromHeader).map(mapRow).filter((r) => r && r.user_id);
}
