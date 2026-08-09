import { NextResponse } from 'next/server';
import {
  reconcileStoredTransactions,
  reconcileTransactions,
  type ReconciledTransaction,
} from '@/lib/statement';
import { syncNextStatementBatch, type StatementSyncResult } from '@/lib/statement-sync';
import { fetchTransactions } from '@/lib/wati';
import {
  filterTransactionRows,
  parseTransactionRange,
  resolveTransactionRange,
} from '@/lib/transaction-range';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const totalAmount = (rows: ReconciledTransaction[]) =>
  rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);

const indiaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function countsByIndiaDay(rows: ReconciledTransaction[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = new Date(row.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const day = indiaDay.format(date);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function GET(req: Request) {
  try {
    const rangeKey = parseTransactionRange(new URL(req.url).searchParams.get('range'));
    const range = resolveTransactionRange(rangeKey);
    let sync: StatementSyncResult | null = null;
    let syncError: string | null = null;
    try {
      sync = await syncNextStatementBatch();
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
    }

    const storedRows = await fetchTransactions(2_000);
    const fallback = sync ? null : await reconcileTransactions(storedRows);
    const allRows = sync ? reconcileStoredTransactions(storedRows) : fallback!.rows;
    const rows = filterTransactionRows(allRows, rangeKey, new Date(range.to).getTime());

    const deposits = rows.filter((r) => r.type === 'deposit');
    const withdrawals = rows.filter((r) => r.type === 'withdrawal');
    const depositApproved = deposits.filter((r) => r.display_status === 'approved');
    const depositRejected = deposits.filter((r) => r.display_status === 'rejected');
    const depositRejectedExplicit = depositRejected.filter((r) => r.status_source === 'webhook');
    const depositRejectedByAbsence = depositRejected.filter((r) => r.status_source === 'statement_absence');
    const depositUnconfirmed = deposits.filter((r) => r.display_status === 'pending' || r.display_status === 'unconfirmed');
    const withdrawalApproved = withdrawals.filter((r) => r.display_status === 'approved');
    const withdrawalUnconfirmed = withdrawals.filter((r) => r.display_status === 'pending' || r.display_status === 'unconfirmed');

    return NextResponse.json({
      configured: true,
      range: {
        key: range.key,
        label: range.label,
        from: range.from === null ? null : new Date(range.from).toISOString(),
        to: new Date(range.to).toISOString(),
      },
      statement: {
        configured: sync?.configured ?? fallback!.configured,
        checkedUsers: sync?.checkedUsers ?? fallback!.checkedUsers,
        failedUsers: sync?.failedUsers ?? fallback!.failedUsers,
        limited: sync ? !sync.coverageComplete : fallback!.limited,
        knownUsers: sync?.knownUsers ?? 0,
        processedInCycle: sync?.processedInCycle ?? 0,
        completedCycles: sync?.completedCycles ?? 0,
        coverageComplete: sync?.coverageComplete ?? false,
        lastRunAt: sync?.lastRunAt ?? null,
        syncError,
      },
      summary: {
        depositCount: deposits.length,
        depositTotalAmount: totalAmount(deposits),
        depositApprovedCount: depositApproved.length,
        depositApprovedAmount: totalAmount(depositApproved),
        depositRejectedCount: depositRejected.length,
        depositRejectedAmount: totalAmount(depositRejected),
        depositRejectedExplicitCount: depositRejectedExplicit.length,
        depositRejectedByAbsenceCount: depositRejectedByAbsence.length,
        depositRejectedByDay: countsByIndiaDay(depositRejected),
        depositUnconfirmedCount: depositUnconfirmed.length,
        depositUnconfirmedAmount: totalAmount(depositUnconfirmed),
        withdrawalCount: withdrawals.length,
        withdrawalApprovedAmount: totalAmount(withdrawalApproved),
        withdrawalUnconfirmedAmount: totalAmount(withdrawalUnconfirmed),
      },
      // Keep enough history for user/transaction search. The client renders a
      // small page at a time, so this does not create a 500-row DOM table.
      recent: rows.slice(0, 500),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A missing table (migration not run yet) shows a friendly setup state.
    const needsSetup = /does not exist|42P01|PGRST205|Could not find the table|failed 404/i.test(message);
    return NextResponse.json({ configured: !needsSetup, error: message }, { status: needsSetup ? 200 : 500 });
  }
}
