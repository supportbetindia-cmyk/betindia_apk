import type { ReportBaseline } from './report-import';
const KEY = 'user_report_baseline_v1';
function connection() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
export async function loadReportBaseline(snapshotKey = KEY): Promise<ReportBaseline | null> {
  const { url, headers } = connection();
  const params = new URLSearchParams({ key: `eq.${snapshotKey}`, select: 'value' });
  const res = await fetch(`${url}/rest/v1/app_settings?${params}`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error('Could not read report baseline. Check app_settings database setup.');
  const rows = await res.json() as { value: string }[];
  return rows.length ? JSON.parse(rows[0].value) as ReportBaseline : null;
}
export async function saveReportBaseline(baseline: ReportBaseline, snapshotKey = KEY) {
  const { url, headers } = connection();
  const res = await fetch(`${url}/rest/v1/app_settings?on_conflict=key`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: snapshotKey, value: JSON.stringify(baseline), updated_at: baseline.importedAt }) });
  if (!res.ok) throw new Error('Could not save baseline. Check app_settings database setup.');
}
