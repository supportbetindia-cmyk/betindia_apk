import { createHash } from 'node:crypto';
import { fetchStatement, statementConfigured } from './statement';
import {
  parseStatementDate,
  reconcileUserTransactions,
  statementEntryMatchesTransaction,
  type StatementEntry,
} from './transaction-reconciliation';
import {
  fetchKnownTransactionUserIds,
  fetchStatementSyncState,
  fetchTransactionsForUser,
  saveStatementSyncState,
  updateTransactionPaymentStatus,
  upsertStatementWithdrawal,
  type TransactionRow,
} from './wati';
import {
  advanceStatementSyncCursor,
  selectStatementSyncBatch,
} from './statement-sync-state';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MIN_INTERVAL_MS = 60_000;
const CONCURRENCY = 5;

export type StatementSyncResult = {
  configured: boolean;
  skipped: boolean;
  knownUsers: number;
  checkedUsers: number;
  failedUsers: number;
  processedInCycle: number;
  completedCycles: number;
  coverageComplete: boolean;
  savedWithdrawals: number;
  updatedStatuses: number;
  lastRunAt: string | null;
};

function statementFingerprint(userId: string, entry: StatementEntry, occurrence: number): string {
  return createHash('sha256')
    .update(`${userId}|${entry.type}|${entry.date}|${entry.pnl}|${occurrence}`)
    .digest('hex')
    .slice(0, 32);
}

function isStatementOnly(row: TransactionRow): boolean {
  return row.branch_id === 'statement-api' || row.transaction_id?.startsWith('statement:') === true;
}

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

async function syncUser(userId: string): Promise<{ savedWithdrawals: number; updatedStatuses: number }> {
  const [entries, storedRows] = await Promise.all([
    fetchStatement(userId),
    fetchTransactionsForUser(userId),
  ]);
  const requestRows = storedRows.filter((row) => !isStatementOnly(row));
  const reconciled = reconcileUserTransactions(requestRows, entries);
  let updatedStatuses = 0;

  for (const row of reconciled) {
    if (row.status_source === 'statement' && row.statement_date) {
      const desiredStatus = `Approved - statement @ ${row.statement_date}`;
      if (row.payment_status !== desiredStatus) {
        await updateTransactionPaymentStatus(row.id, desiredStatus);
        updatedStatuses++;
      }
    } else if (row.status_source === 'statement_absence') {
      const desiredStatus = 'Rejected - absent from final API after 5h';
      if (row.payment_status !== desiredStatus) {
        await updateTransactionPaymentStatus(row.id, desiredStatus);
        updatedStatuses++;
      }
    } else if (/statement/i.test(row.payment_status ?? '')) {
      await updateTransactionPaymentStatus(row.id, null);
      updatedStatuses++;
    }
  }

  const storedWithdrawals = storedRows.filter((row) => row.type === 'withdrawal');
  const identity = requestRows.find((row) => row.user_name || row.mobile_number) ?? requestRows[0];
  const occurrences = new Map<string, number>();
  let savedWithdrawals = 0;

  for (const entry of entries) {
    if (entry.type !== 'auto_withdrawal') continue;
    const alreadyStored = storedWithdrawals.some((row) => statementEntryMatchesTransaction(row, entry));
    if (alreadyStored) continue;

    const occurrenceKey = `${entry.type}|${entry.date}|${entry.pnl}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    const parsedDate = parseStatementDate(entry.date);
    const amount = Math.abs(Number(entry.pnl));
    if (!Number.isFinite(parsedDate) || !Number.isFinite(amount)) continue;

    await upsertStatementWithdrawal({
      transactionId: `statement:${statementFingerprint(userId, entry, occurrence)}`,
      userId,
      branchId: identity?.branch_id ?? null,
      userName: identity?.user_name ?? null,
      mobileNumber: identity?.mobile_number ?? null,
      amount,
      statementDate: entry.date,
      createdAt: new Date(parsedDate).toISOString(),
      entry,
    });
    savedWithdrawals++;
  }

  return { savedWithdrawals, updatedStatuses };
}

export async function syncNextStatementBatch(options: {
  batchSize?: number;
  minIntervalMs?: number;
  force?: boolean;
} = {}): Promise<StatementSyncResult> {
  if (!statementConfigured()) {
    return {
      configured: false,
      skipped: true,
      knownUsers: 0,
      checkedUsers: 0,
      failedUsers: 0,
      processedInCycle: 0,
      completedCycles: 0,
      coverageComplete: false,
      savedWithdrawals: 0,
      updatedStatuses: 0,
      lastRunAt: null,
    };
  }

  const [knownUsers, state] = await Promise.all([
    fetchKnownTransactionUserIds(),
    fetchStatementSyncState(),
  ]);
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const lastRunMs = state.lastRunAt ? new Date(state.lastRunAt).getTime() : Number.NaN;
  if (!options.force && Number.isFinite(lastRunMs) && Date.now() - lastRunMs < minIntervalMs) {
    return {
      configured: true,
      skipped: true,
      knownUsers: knownUsers.length,
      checkedUsers: 0,
      failedUsers: 0,
      processedInCycle: state.completedCycles > 0 ? knownUsers.length : state.cycleProcessed,
      completedCycles: state.completedCycles,
      coverageComplete: state.completedCycles > 0,
      savedWithdrawals: 0,
      updatedStatuses: 0,
      lastRunAt: state.lastRunAt,
    };
  }

  const batch = selectStatementSyncBatch(knownUsers, state, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const results = await mapWithConcurrency(batch.users, syncUser);
  const fulfilled = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof syncUser>>> => result.status === 'fulfilled');
  const nextCursor = advanceStatementSyncCursor(state, batch);
  const lastRunAt = new Date().toISOString();
  await saveStatementSyncState({
    id: state.id,
    ...nextCursor,
    lastRunAt,
  });

  return {
    configured: true,
    skipped: false,
    knownUsers: knownUsers.length,
    checkedUsers: fulfilled.length,
    failedUsers: results.length - fulfilled.length,
    processedInCycle: batch.reachedEnd ? knownUsers.length : nextCursor.cycleProcessed,
    completedCycles: nextCursor.completedCycles,
    coverageComplete: nextCursor.completedCycles > 0,
    savedWithdrawals: fulfilled.reduce((sum, result) => sum + result.value.savedWithdrawals, 0),
    updatedStatuses: fulfilled.reduce((sum, result) => sum + result.value.updatedStatuses, 0),
    lastRunAt,
  };
}
