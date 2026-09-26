'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Clock3, Search, Upload, Users } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useMasterFilter } from '@/components/MasterFilterProvider';
import { withMaster } from '@/lib/master-filter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { money as inr, day } from '@/lib/format';
import { backendRequest } from '@/lib/backend-api';
import { parseUsersCsv } from '@/lib/user-file';

// Player figures can carry paise → show 2 decimals.
const money = (v: string | number | null | undefined) => inr(v, 2);

type Customer = {
  id: string;
  externalUserId: string | null;
  masterId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  accountStatus: string | null;
  currentLifecycle: string | null;
  currentCategory: string | null;
  registrationAt: string | null;
  ftdDate: string | null;
  ftdAmount: string | number | null;
  totalDeposits: string | number | null;
  depositCount: number | null;
  totalWithdrawals: string | number | null;
  withdrawalCount: number | null;
  netPnl: string | number | null;
  lastDepositAt: string | null;
  lastDepositAmount: string | number | null;
  lastWithdrawalAt: string | null;
  lastWithdrawalAmount: string | number | null;
  todayDeposits: number;
  todayWithdrawals: number;
  createdAt: string;
};

type CustomerList = {
  data: Customer[];
  page: number;
  pageSize: number;
  total: number;
};
type ScheduleStatus = { enabled: boolean; timezone: string; atRiskDays: number; inactiveDays: number; lastRunAt: string | null };

async function loadCustomers(search: string, page: number, missingReg: boolean, masterId: string, tenantId: string | null, signal: AbortSignal): Promise<CustomerList> {
  const query = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (search) query.set('search', search);
  if (missingReg) query.set('missingRegistration', 'true');
  return backendRequest<CustomerList>(withMaster(`/customers?${query.toString()}`, masterId), { tenantId, signal });
}

// Everyday words + colour for each lifecycle stage, so anyone can read it.
const STAGE: Record<string, { label: string; bg: string; fg: string }> = {
  Lead: { label: 'New lead', bg: '#f1f5f9', fg: '#475569' },
  Registered: { label: 'Signed up', bg: '#eff6ff', fg: '#1d4ed8' },
  FTD: { label: 'First deposit done', bg: '#ecfdf3', fg: '#15803d' },
  'Repeat Depositor': { label: 'Deposits again', bg: '#ecfdf3', fg: '#15803d' },
  'Regular Player': { label: 'Regular player', bg: '#dcfce7', fg: '#166534' },
  'At Risk': { label: 'Going quiet', bg: '#fff7ed', fg: '#c2410c' },
  Inactive: { label: 'Inactive', bg: '#fef2f2', fg: '#b91c1c' },
};
function StageBadge({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: '#94a3b8' }}>—</span>;
  const s = STAGE[value] ?? { label: value, bg: '#f1f5f9', fg: '#475569' };
  return <span style={{ background: s.bg, color: s.fg, fontWeight: 600, fontSize: 12, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

type ImportKind = 'customers' | 'transactions' | null;

export default function CustomersPage() {
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState<ImportKind>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [missingReg, setMissingReg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { tenantId, masterId, scopedHref } = useMasterFilter();
  const query = useQuery({
    queryKey: ['backend-customers', tenantId, search, page, missingReg, masterId],
    queryFn: ({ signal }) => loadCustomers(search, page, missingReg, masterId, tenantId, signal),
    enabled: Boolean(tenantId),
  });
  const schedule = useQuery({
    queryKey: ['classification-schedule', tenantId],
    queryFn: () => backendRequest<ScheduleStatus>('/classification/schedule'),
    enabled: Boolean(tenantId),
  });

  // CSV upload: parse in the browser with the shared User Master parser, then post the
  // rows to the backend for a single bulk upsert. Lets any tenant onboard from a file
  // (webhooks keep it live afterwards).
  const csvUpload = useMutation({
    mutationFn: async (file: File) => {
      const parsed = parseUsersCsv(await file.text());
      if (parsed.length === 0) {
        throw new Error('No customers found. The file needs a "User ID" column.');
      }
      const rows = parsed.map((u) => ({
        externalUserId: u.user_id,
        masterId: u.branch_id ?? null,
        name: u.name ?? null,
        phone: u.mobile ?? null,
        registrationAt: u.register_date ?? null,
        accountStatus: u.report?.status_label ?? null,
        currentCategory: u.report?.category ?? null,
        ftdDate: u.report?.first_deposit_date ?? null,
        ftdAmount: u.report?.first_deposit_amount ?? null,
        totalDeposits: u.report?.total_deposit ?? null,
        depositCount: u.report?.deposit_count ?? null,
        totalWithdrawals: u.report?.total_withdrawal ?? null,
        withdrawalCount: u.report?.withdrawal_count ?? null,
        netPnl: u.report?.pnl ?? null,
        totalBonus: u.report?.total_bonus ?? null,
        lastDepositAt: u.report?.last_deposit_date ?? null,
        lastDepositAmount: u.report?.last_deposit_amount ?? null,
        lastWithdrawalAt: u.report?.last_withdrawal_date ?? null,
        lastWithdrawalAmount: u.report?.last_withdrawal_amount ?? null,
      }));
      return backendRequest<{ received: number; processed: number }>('/imports/customers', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
    },
    onSuccess: (result) => {
      setImportResult(`Uploaded ${result.received.toLocaleString()} rows → imported ${result.processed.toLocaleString()} customers.`);
      query.refetch();
    },
    onError: (err) => setImportResult(err instanceof Error ? err.message : 'CSV import failed'),
  });

  // Re-sort every player into their stage/tier from the latest numbers.
  const recompute = useMutation({
    mutationFn: () => backendRequest<{ changed: number }>('/classification/recompute', { method: 'POST' }),
    onSuccess: (result) => {
      setImportResult(`Groups updated for ${result.changed.toLocaleString()} players.`);
      query.refetch();
    },
    onError: (err) => setImportResult(err instanceof Error ? err.message : 'Could not update groups'),
  });

  const busy = importing !== null || csvUpload.isPending || recompute.isPending;

  function onCsvSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // let the same file be re-selected later
    if (!file) return;
    setImportResult(null);
    csvUpload.mutate(file);
  }

  useAuthRedirect(query.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  async function importLegacyCustomers() {
    setImporting('customers');
    setImportResult(null);
    try {
      const result = await backendRequest<{ processed: number }>('/imports/legacy/customers', { method: 'POST' });
      setImportResult(`Imported ${result.processed.toLocaleString()} customer records.`);
      await query.refetch();
    } catch (error) {
      setImportResult(error instanceof Error ? error.message : 'Customer import failed');
    } finally {
      setImporting(null);
    }
  }

  async function importLegacyTransactions() {
    setImporting('transactions');
    setImportResult(null);
    try {
      const result = await backendRequest<{ processed: number; skippedNoCustomer: number }>(
        '/imports/legacy/transactions',
        { method: 'POST' },
      );
      const skipped = result.skippedNoCustomer
        ? ` ${result.skippedNoCustomer.toLocaleString()} skipped (no matching customer — import customers first).`
        : '';
      setImportResult(`Imported ${result.processed.toLocaleString()} transaction records.${skipped}`);
    } catch (error) {
      setImportResult(error instanceof Error ? error.message : 'Transaction import failed');
    } finally {
      setImporting(null);
    }
  }

  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 50));

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Players</h1>
            <p className="page-sub">All your players in one place. Click a name to see their money.</p>
            {schedule.data ? <div className="classification-schedule"><Clock3 size={13} /> Automatic grouping daily · At risk after {schedule.data.atRiskDays} days · Inactive after {schedule.data.inactiveDays} days{schedule.data.lastRunAt ? ` · Last run ${new Date(schedule.data.lastRunAt).toLocaleString('en-IN')}` : ' · Waiting for first run'}</div> : null}
          </div>
          {tenantId ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onCsvSelected}
                style={{ display: 'none' }}
              />
              <Button onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload size={15} style={{ marginRight: 6 }} />
                {csvUpload.isPending ? 'Uploading…' : 'Upload CSV'}
              </Button>
              <Button variant="outline" onClick={importLegacyCustomers} disabled={busy}>
                {importing === 'customers' ? 'Importing…' : 'Import customers'}
              </Button>
              <Button variant="outline" onClick={importLegacyTransactions} disabled={busy}>
                {importing === 'transactions' ? 'Importing…' : 'Import transactions'}
              </Button>
              <Button variant="outline" onClick={() => { setImportResult(null); recompute.mutate(); }} disabled={busy}>
                {recompute.isPending ? 'Updating…' : 'Recompute groups'}
              </Button>
            </div>
          ) : null}
        </header>

        {!tenantId ? (
          <div className="banner2">Select a company on the <Link href="/saas"><u>SaaS console</u></Link> before loading customers.</div>
        ) : null}

        {importResult ? (
          <div className="banner2" style={{ color: /imported|uploaded|updated/i.test(importResult) ? '#15803d' : '#b91c1c' }}>{importResult}</div>
        ) : null}

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>All players</h3>
              <div className="page-sub">
                {query.data
                  ? `${query.data.total.toLocaleString()} ${missingReg ? 'players with no join date' : 'players'}`
                  : 'Counting players…'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <form onSubmit={submit} style={{ display: 'flex', gap: 8, minWidth: 340 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
                  <Input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} className="pl-8" placeholder="Search by name, phone or ID" />
                </div>
                <Button type="submit">Search</Button>
              </form>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={missingReg}
                  onChange={(event) => { setPage(1); setMissingReg(event.target.checked); }}
                />
                Show only players with no join date
              </label>
            </div>
          </div>

          {query.isError ? <div className="banner2">{query.error instanceof Error ? query.error.message : 'Could not load players'}</div> : null}
          {query.isLoading ? <div className="empty2">Loading players…</div> : null}
          {query.data && query.data.data.length === 0 ? <div className="empty2">
            <Users size={22} />
            <div>{search ? 'No players found for this search.' : 'No players yet. Upload a CSV file to add them.'}</div>
            {!search ? <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => fileRef.current?.click()} disabled={busy}>{csvUpload.isPending ? 'Uploading…' : 'Upload CSV'}</Button>
              <Button variant="outline" onClick={importLegacyCustomers} disabled={busy}>{importing === 'customers' ? 'Importing…' : 'Import legacy customers'}</Button>
            </div> : null}
          </div> : null}

          {query.data?.data.length ? (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <style>{`
                .players-table { border-collapse: collapse; font-size: 13px; white-space: nowrap; min-width: 1500px; width: 100%; }
                .players-table th, .players-table td { padding: 11px 16px; }
                .players-table thead th { text-align: left; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; background: #fafbfc; }
                .players-table tbody tr { border-bottom: 1px solid #eef2f7; }
                .players-table tbody tr:hover { background: #f8fafc; }
                .players-table .num { text-align: right; font-variant-numeric: tabular-nums; }
                .players-table .muted { color: #94a3b8; font-weight: 400; }
              `}</style>
              <table className="players-table">
                <thead><tr>
                  <th>Name</th>
                  <th>Player ID</th>
                  <th>Phone</th>
                  <th>Stage</th>
                  <th>Group</th>
                  <th>Joined on</th>
                  <th>First deposit</th>
                  <th>Last deposit</th>
                  <th>Last withdrawal</th>
                  <th className="num">Today in</th>
                  <th className="num">Today out</th>
                  <th className="num">Total in</th>
                  <th className="num">Total out</th>
                  <th className="num">Profit / Loss</th>
                  <th>Status</th>
                </tr></thead>
                <tbody>{query.data.data.map((customer) => {
                  const pnl = customer.netPnl == null || customer.netPnl === '' ? null : Number(customer.netPnl);
                  return (
                    <tr key={customer.id}>
                      <td><Link href={scopedHref(`/customers/${customer.id}`)} style={{ color: '#4f46e5', fontWeight: 700 }}>{customer.name || 'No name'}</Link></td>
                      <td>{customer.externalUserId || customer.masterId || <span className="muted">—</span>}</td>
                      <td>{customer.phone || <span className="muted">—</span>}</td>
                      <td><StageBadge value={customer.currentLifecycle} /></td>
                      <td>{customer.currentCategory ? <Badge variant="secondary">{customer.currentCategory}</Badge> : <span className="muted">—</span>}</td>
                      <td>{day(customer.registrationAt) || <span className="muted">—</span>}</td>
                      <td>{money(customer.ftdAmount) || <span className="muted">—</span>}{customer.ftdDate ? <span className="muted"> · {day(customer.ftdDate)}</span> : null}</td>
                      <td>{money(customer.lastDepositAmount) || <span className="muted">—</span>}{customer.lastDepositAt ? <span className="muted"> · {day(customer.lastDepositAt)}</span> : null}</td>
                      <td>{money(customer.lastWithdrawalAmount) || <span className="muted">—</span>}{customer.lastWithdrawalAt ? <span className="muted"> · {day(customer.lastWithdrawalAt)}</span> : null}</td>
                      <td className="num" style={{ color: customer.todayDeposits ? '#15803d' : '#94a3b8', fontWeight: 600 }}>{customer.todayDeposits ? money(customer.todayDeposits) : '—'}</td>
                      <td className="num" style={{ color: customer.todayWithdrawals ? '#b91c1c' : '#94a3b8', fontWeight: 600 }}>{customer.todayWithdrawals ? money(customer.todayWithdrawals) : '—'}</td>
                      <td className="num" style={{ color: customer.totalDeposits ? '#15803d' : '#94a3b8', fontWeight: 600 }}>
                        {money(customer.totalDeposits) || '—'}{customer.depositCount ? <span className="muted"> ({customer.depositCount})</span> : null}
                      </td>
                      <td className="num" style={{ color: customer.totalWithdrawals ? '#b91c1c' : '#94a3b8', fontWeight: 600 }}>
                        {money(customer.totalWithdrawals) || '—'}{customer.withdrawalCount ? <span className="muted"> ({customer.withdrawalCount})</span> : null}
                      </td>
                      <td className="num" style={{ fontWeight: 700, color: pnl == null ? '#94a3b8' : pnl >= 0 ? '#15803d' : '#b91c1c' }}>
                        {pnl == null ? '—' : money(Math.abs(pnl))}
                      </td>
                      <td>{customer.accountStatus || <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16 }}>
                <span style={{ color: '#64748b', fontSize: 13 }}>Page {page} of {pages}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                  <Button variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
