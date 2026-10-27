// Client-side CSV: build + trigger a download. Same safety rules as the backend
// serializer (quote special chars, escape quotes, neutralize formula injection).

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // formula-injection guard
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(cell).join(',');
  const body = rows.map((r) => columns.map((c) => cell(r[c])).join(',')).join('\n');
  return rows.length ? `${header}\n${body}\n` : `${header}\n`;
}

/** Build the CSV and prompt a download in the browser. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns: string[]): void {
  const blob = new Blob([rowsToCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
