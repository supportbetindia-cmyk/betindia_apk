'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { parseUsersCsv, type ParsedUser } from '@/lib/user-file';
import { FileSpreadsheet, Download, CheckCircle2, XCircle, Loader2, UploadCloud } from 'lucide-react';

type MatchResult = {
  uploaded: number;
  unique: number;
  existing: string[];
  missing: string[];
  error?: string;
};

// Read a File as CSV text — .xlsx/.xls go through SheetJS, .csv is read directly.
async function fileToCsvText(file: File): Promise<string> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  if (!isExcel) return file.text();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(sheet);
}

export function CsvMatch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MatchResult | null>(null);
  // Keep the uploaded rows so downloads/import can include all CSV data, not just IDs.
  const [byId, setById] = useState<Map<string, ParsedUser>>(new Map());
  const [view, setView] = useState<'missing' | 'existing'>('missing');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [hasReport, setHasReport] = useState(false);

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    setImportMsg('');
    setFileName(file.name);
    try {
      const text = await fileToCsvText(file);
      const parsed = parseUsersCsv(text);
      if (!parsed.length) {
        setError('No users found. The file needs a "User_ID" column (with an optional Name / Phone_Number).');
        return;
      }
      const map = new Map<string, ParsedUser>();
      for (const p of parsed) map.set(String(p.user_id).trim(), p);
      setById(map);
      setHasReport(parsed.some((p) => p.report));

      const res = await fetch('/api/user-analytics/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: parsed.map((p) => p.user_id) }),
      });
      const body = (await res.json()) as MatchResult;
      if (!res.ok) throw new Error(body.error || 'Match failed');
      setResult(body);
      setView('missing');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const download = useCallback((ids: string[], label: string) => {
    const header = 'User_ID,Name,Phone_Number\n';
    const rows = ids.map((id) => {
      const u = byId.get(id);
      const name = (u?.name ?? '').replace(/"/g, '""');
      const mobile = u?.mobile ?? '';
      return `${id},"${name}",${mobile}`;
    });
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [byId]);

  const payloadFor = useCallback((ids: string[]) => ids.map((id) => {
    const u = byId.get(id);
    return {
      user_id: id,
      branch_id: u?.branch_id ?? null,
      mobile: u?.mobile ?? null,
      name: u?.name ?? null,
      language: u?.language ?? null,
      register_date: u?.register_date ?? null,
      raw: u?.raw ?? null,
      report: u?.report ?? null,
    };
  }), [byId]);

  const runImport = useCallback(async (ids: string[], successMsg: (n: number) => string) => {
    if (!ids.length) return;
    setImporting(true);
    setImportMsg('');
    setError('');
    try {
      const users = payloadFor(ids);
      const res = await fetch('/api/user-analytics/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users }),
      });
      const body = (await res.json()) as { imported?: number; error?: string };
      if (!res.ok) throw new Error(body.error || 'Import failed');
      setResult((prev) => prev ? { ...prev, existing: [...prev.existing, ...prev.missing], missing: [] } : prev);
      setView('existing');
      setImportMsg(successMsg(body.imported ?? users.length));
      void queryClient.invalidateQueries({ queryKey: ['user-analytics'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [payloadFor, queryClient]);

  const importMissing = useCallback(() => {
    if (!result) return;
    void runImport(result.missing, (n) => `Imported ${n} new users (with all their CSV data).`);
  }, [result, runImport]);

  // Upsert EVERY user in the file (new + existing) so lifetime financials sync.
  const syncAll = useCallback(() => {
    if (!result) return;
    const allIds = [...result.existing, ...result.missing];
    void runImport(allIds, (n) => `Synced ${n} users' data (deposits, withdrawals, P/L) from this report.`);
  }, [result, runImport]);

  const list = result ? (view === 'missing' ? result.missing : result.existing) : [];

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Check a CSV against the database</h3>
        <label className="btn-ghost" style={{ cursor: 'pointer' }}>
          {busy ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />}
          {busy ? 'Checking…' : 'Upload CSV / Excel'}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => { void onFile(e.target.files?.[0]); if (inputRef.current) inputRef.current.value = ''; }}
          />
        </label>
      </div>

      {error ? <div className="banner2">{error}</div> : null}

      {!result && !error ? (
        <div className="empty2">
          Upload a user list (needs a <code>User_ID</code> column). I&apos;ll tell you which users are already in the
          database and which are new — and let you download either list.
        </div>
      ) : null}

      {result ? (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 14 }}>
            <div className="kpi" style={{ ['--accent' as string]: '#4f46e5' }}>
              <div className="kpi-body">
                <div className="kpi-label">Uploaded</div>
                <div className="kpi-value">{result.unique.toLocaleString('en-IN')}</div>
                <div className="kpi-delta"><span className="kpi-vs">unique user IDs · {fileName}</span></div>
              </div>
            </div>
            <div className="kpi" style={{ ['--accent' as string]: '#059669' }}>
              <div className="kpi-icon"><CheckCircle2 size={20} /></div>
              <div className="kpi-body">
                <div className="kpi-label">Already in database</div>
                <div className="kpi-value">{result.existing.length.toLocaleString('en-IN')}</div>
                <div className="kpi-delta"><span className="kpi-vs">matched existing users</span></div>
              </div>
            </div>
            <div className="kpi" style={{ ['--accent' as string]: '#dc2626' }}>
              <div className="kpi-icon"><XCircle size={20} /></div>
              <div className="kpi-body">
                <div className="kpi-label">Not in database</div>
                <div className="kpi-value">{result.missing.length.toLocaleString('en-IN')}</div>
                <div className="kpi-delta"><span className="kpi-vs">new / not uploaded yet</span></div>
              </div>
            </div>
          </div>

          <div className="txn-toolbar" style={{ justifyContent: 'space-between' }}>
            <div className="txn-filters">
              <button className={`txn-filter${view === 'missing' ? ' active' : ''}`} onClick={() => setView('missing')}>
                Not in DB ({result.missing.length})
              </button>
              <button className={`txn-filter${view === 'existing' ? ' active' : ''}`} onClick={() => setView('existing')}>
                In DB ({result.existing.length})
              </button>
            </div>
            <div className="txn-filters">
              {hasReport ? (
                <button className="btn-primary" disabled={importing} onClick={syncAll} title="Insert new users and update existing users' lifetime financials from this report">
                  {importing ? <Loader2 size={15} className="spin" /> : <UploadCloud size={15} />}
                  {importing ? 'Syncing…' : `Sync all ${(result.existing.length + result.missing.length).toLocaleString('en-IN')} users' data`}
                </button>
              ) : result.missing.length ? (
                <button className="btn-primary" disabled={importing} onClick={importMissing}>
                  {importing ? <Loader2 size={15} className="spin" /> : <UploadCloud size={15} />}
                  {importing ? 'Importing…' : `Import ${result.missing.length} new users`}
                </button>
              ) : null}
              <button
                className="btn-ghost"
                disabled={!list.length}
                onClick={() => download(list, view === 'missing' ? 'not-in-database' : 'in-database')}
              >
                <Download size={15} /> Download {view === 'missing' ? 'missing' : 'existing'} CSV
              </button>
            </div>
          </div>

          {importMsg ? <div className="banner2 banner-ok">{importMsg}</div> : null}

          <div className="ua-table" style={{ marginTop: 10 }}>
            <div className="ua-head" style={{ gridTemplateColumns: '1fr 1.5fr 1fr' }}>
              <span>User ID</span><span>Name</span><span>Mobile</span>
            </div>
            {list.slice(0, 200).map((id) => {
              const u = byId.get(id);
              return (
                <div className="ua-row" key={id} style={{ gridTemplateColumns: '1fr 1.5fr 1fr' }}>
                  <span className="txn-mono">{id}</span>
                  <span>{u?.name ?? '—'}</span>
                  <span className="txn-mono">{u?.mobile ?? '—'}</span>
                </div>
              );
            })}
            {list.length > 200 ? (
              <div className="txn-load-more"><span>Showing first 200 of {list.length.toLocaleString('en-IN')} — download for the full list</span></div>
            ) : null}
            {!list.length ? <div className="empty2">None in this bucket.</div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
