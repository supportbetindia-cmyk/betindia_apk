export type BaselineUser = {
  userId: string; name: string | null; mobile: string | null; registeredAt: string | null;
  firstDepositDate: string | null; firstDepositAmount: number | null;
  lastDepositDate: string | null; lastWithdrawalDate: string | null;
  deposits: number; withdrawals: number; depositCount: number; withdrawalCount: number;
  totalBonus: number; category: string | null;
  hasTotals?: boolean;
};
export type ReportBaseline = { cutoff: string; importedAt: string; filename: string; users: BaselineUser[] };
export function inferReportCutoff(users: BaselineUser[]): string {
  const times = users.flatMap(u=>[u.lastDepositDate,u.lastWithdrawalDate,u.firstDepositDate]).filter((d): d is string=>Boolean(d)).map(Date.parse).filter(Number.isFinite);
  if (!times.length) throw new Error('The report has no dated payment activity, so its totals cutoff cannot be inferred.');
  const cutoff = Math.max(...times) + 86_400_000 - 1;
  if (cutoff > Date.now()) throw new Error('The report contains future payment dates. Correct them before syncing.');
  return new Date(cutoff).toISOString();
}
export function indiaImportDate(value: string): string | null {
  const text = value.trim();
  if (!text || text === '0') return null;
  let y: number, m: number, d: number;
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  const short = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(text);
  const long = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(text);
  if (iso) { y = +iso[1]; m = +iso[2] - 1; d = +iso[3]; }
  else if (short) { y = +short[3] + (short[3].length === 2 ? 2000 : 0); m = months.indexOf(short[2].toLowerCase()); d = +short[1]; }
  else if (long) { y = +long[3]; m = months.indexOf(long[1].slice(0,3).toLowerCase()); d = +long[2]; }
  else throw new Error(`Unrecognized date: ${text}`);
  const utc = new Date(Date.UTC(y, m, d));
  if (m < 0 || utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m || utc.getUTCDate() !== d) throw new Error(`Invalid date: ${text}`);
  return new Date(utc.getTime() - 19_800_000).toISOString();
}
export function parseReportGrid(grid: unknown[][]) {
  const clean = (value: unknown) => String(value ?? '').replace(/^\uFEFF/, '').trim();
  const index = grid.findIndex(row => row.some(v => clean(v) === 'User ID') && row.some(v => clean(v) === 'Total Deposit'));
  if (index < 0) throw new Error('Missing User ID and Total Deposit header. Use the User Master report format.');
  const header = grid[index].map(clean);
  const required = ['Registration Date','First Deposit Date','First Deposit Amount','Total Deposit','Total Withdrawal','Total Deposit Count (TDC)','Total Withdrawal Count (TWC)'];
  for (const column of required) if (!header.includes(column)) throw new Error(`Missing column: ${column}`);
  const users: BaselineUser[] = []; const errors: string[] = []; const warnings: string[] = [];
  const seen = new Set<string>(); let duplicateCount = 0;
  for (let i = index + 1; i < grid.length; i++) {
    const cells = grid[i].map(clean);
    if (!cells.some(Boolean)) continue;
    const row = Object.fromEntries(header.map((key, j) => [key, cells[j] ?? '']));
    if (!row['User ID'] && !/^\d+$/.test(row['S.No'] ?? '')) continue;
    try {
      const id = row['User ID']; if (!id) throw new Error('Missing User ID');
      const identityOnly = ['Total Deposit','Total Withdrawal','Total Deposit Count (TDC)','Total Withdrawal Count (TWC)'].every(k => !row[k]);
      const number = (key: string, count = false) => {
        const text = (row[key] ?? '').replaceAll(',', '');
        if (!text && required.includes(key) && !identityOnly) throw new Error(`Missing ${key}`);
        const n = Number(text || 0);
        if (!Number.isFinite(n) || n < 0 || (count && !Number.isInteger(n))) throw new Error(`Invalid ${key}`);
        return n;
      };
      const user: BaselineUser = { userId: id, name: row.Name && row.Name !== '0' ? row.Name : null, mobile: row['Phone Number'] || null,
        registeredAt: indiaImportDate(row['Registration Date']), firstDepositDate: indiaImportDate(row['First Deposit Date']), firstDepositAmount: row['First Deposit Amount'] ? number('First Deposit Amount') : null,
        lastDepositDate: indiaImportDate(row['Last Deposit Date'] ?? ''), lastWithdrawalDate: indiaImportDate(row['Last Withdrawal Date'] ?? ''),
        deposits: number('Total Deposit'), withdrawals: number('Total Withdrawal'), depositCount: number('Total Deposit Count (TDC)', true), withdrawalCount: number('Total Withdrawal Count (TWC)', true), totalBonus: number('Total Bonus'), category: row.Category && row.Category !== '0' ? row.Category : null, hasTotals: !identityOnly };
      if (seen.has(id)) { duplicateCount++; warnings.push(`Row ${i + 1}: repeated User ID ${id}; first occurrence retained.`); continue; }
      seen.add(id); users.push(user);
      if (identityOnly) warnings.push(`Row ${i + 1}: ${id} has no historical totals. Identity retained; reports will use available webhook history.`);
      if (row['P/L'] && Math.abs(Number(row['P/L'].replaceAll(',', '')) - (user.deposits - user.withdrawals)) > 0.01) warnings.push(`Row ${i + 1}: P/L differs from net deposits; report will calculate net deposits.`);
    } catch (error) { errors.push(`Row ${i + 1}: ${(error as Error).message}`); }
  }
  if (!users.length) errors.push('No valid users found.');
  return { users, errors, warnings, duplicateCount };
}
