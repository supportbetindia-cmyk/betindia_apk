export type TransactionForReconciliation = {
  id: number;
  type: 'deposit' | 'withdrawal';
  amount: number | null;
  payment_status: string | null;
  created_at: string;
};

export type StatementEntry = {
  description: string;
  pnl: string;
  date: string;
  type: string;
};

export type DisplayStatus = 'approved' | 'rejected' | 'pending' | 'unconfirmed';
export type StatusSource = 'webhook' | 'statement' | 'statement_absence' | 'none';

export type Reconciliation = {
  display_status: DisplayStatus;
  status_label: string;
  status_source: StatusSource;
  statement_date: string | null;
};

const APPROVED = /approv|success|complet/i;
const REJECTED = /reject|declin|fail|cancel/i;
const PENDING = /pending|hold|process|initiated/i;
const INDIA_OFFSET_MS = 330 * 60 * 1000;
export const DEFAULT_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_REJECTION_GRACE_MS = 5 * 60 * 60 * 1000;

export type ReconciliationOptions = {
  matchWindowMs?: number;
  rejectAfterMs?: number;
  nowMs?: number;
};

function persistedStatementDate(status: string | null): string | null {
  const match = /approved\s*-\s*statement\s*@\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/i.exec(status ?? '');
  return match?.[1] ?? null;
}

export function storedReconciliation(status: string | null): Reconciliation {
  if (/no statement/i.test(status ?? '')) {
    return { display_status: 'rejected', status_label: 'Rejected · absent from final API after 5h', status_source: 'statement_absence', statement_date: null };
  }
  if (APPROVED.test(status ?? '')) {
    if (/statement/i.test(status ?? '')) {
      return { display_status: 'approved', status_label: 'Approved · statement', status_source: 'statement', statement_date: null };
    }
    return { display_status: 'approved', status_label: status || 'Approved', status_source: 'webhook', statement_date: null };
  }
  if (REJECTED.test(status ?? '')) {
    return { display_status: 'rejected', status_label: status || 'Rejected', status_source: 'webhook', statement_date: null };
  }
  if (PENDING.test(status ?? '')) {
    return { display_status: 'pending', status_label: status || 'Pending', status_source: 'webhook', statement_date: null };
  }
  return { display_status: 'unconfirmed', status_label: 'Unconfirmed', status_source: 'none', statement_date: null };
}

/** Statement timestamps are returned without a timezone; the provider operates in IST. */
export function parseStatementDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) - INDIA_OFFSET_MS;
}

function entryMatchesType(entry: StatementEntry, type: TransactionForReconciliation['type']): boolean {
  return type === 'deposit' ? entry.type === 'auto_deposit' : entry.type === 'auto_withdrawal';
}

function amountMatches(transactionAmount: number | null, pnl: string): boolean {
  if (transactionAmount === null || !Number.isFinite(transactionAmount)) return false;
  const statementAmount = Math.abs(Number(pnl));
  return Number.isFinite(statementAmount) && Math.abs(Math.abs(transactionAmount) - statementAmount) < 0.01;
}

export function statementEntryMatchesTransaction(
  transaction: TransactionForReconciliation,
  entry: StatementEntry,
  matchWindowMs: number = DEFAULT_MATCH_WINDOW_MS
): boolean {
  if (!entryMatchesType(entry, transaction.type) || !amountMatches(transaction.amount, entry.pnl)) return false;
  const transactionTime = new Date(transaction.created_at).getTime();
  const statementTime = parseStatementDate(entry.date);
  return Number.isFinite(transactionTime)
    && Number.isFinite(statementTime)
    && Math.abs(transactionTime - statementTime) <= matchWindowMs;
}

/**
 * Confirm pending/unknown rows against settled wallet entries for one user.
 * Each statement entry can confirm only one transaction. Explicit webhook
 * approvals/rejections always win over heuristic statement matching.
 */
export function reconcileUserTransactions<T extends TransactionForReconciliation>(
  transactions: T[],
  entries: StatementEntry[],
  options: ReconciliationOptions = {}
): Array<T & Reconciliation> {
  const matchWindowMs = options.matchWindowMs ?? DEFAULT_MATCH_WINDOW_MS;
  const rejectAfterMs = options.rejectAfterMs ?? DEFAULT_REJECTION_GRACE_MS;
  const nowMs = options.nowMs ?? Date.now();
  const usedEntries = new Set<number>();
  const ordered = [...transactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const resolved = new Map<number, Reconciliation>();

  // Reserve statement entries already attached by an earlier sync. Without
  // this, the same settled entry could approve another same-amount request on
  // the next background pass.
  for (const transaction of ordered) {
    const stored = storedReconciliation(transaction.payment_status);
    if (stored.status_source !== 'statement') continue;
    const savedDate = persistedStatementDate(transaction.payment_status);
    if (!savedDate) continue; // legacy rows are rematched once and upgraded

    const savedIndex = entries.findIndex((entry, index) =>
      !usedEntries.has(index)
      && entry.date === savedDate
      && statementEntryMatchesTransaction(transaction, entry, matchWindowMs)
    );
    if (savedIndex >= 0) {
      usedEntries.add(savedIndex);
      resolved.set(transaction.id, { ...stored, statement_date: savedDate });
    } else {
      // Keep a historical approval if the provider later truncates its list.
      resolved.set(transaction.id, { ...stored, statement_date: savedDate });
    }
  }

  for (const transaction of ordered) {
    if (resolved.has(transaction.id)) continue;
    const stored = storedReconciliation(transaction.payment_status);
    if (
      (stored.display_status === 'approved' || stored.display_status === 'rejected')
      && stored.status_source === 'webhook'
    ) {
      resolved.set(transaction.id, stored);
      continue;
    }

    const transactionTime = new Date(transaction.created_at).getTime();
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < entries.length; index++) {
      if (usedEntries.has(index)) continue;
      const entry = entries[index];
      if (!statementEntryMatchesTransaction(transaction, entry, matchWindowMs)) continue;
      const statementTime = parseStatementDate(entry.date);
      const distance = Math.abs(transactionTime - statementTime);
      if (distance <= matchWindowMs && distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    }

    if (bestIndex >= 0) {
      usedEntries.add(bestIndex);
      resolved.set(transaction.id, {
        display_status: 'approved',
        status_label: 'Approved · statement',
        status_source: 'statement',
        statement_date: entries[bestIndex].date,
      });
    } else {
      const ageMs = nowMs - transactionTime;
      if (transaction.type === 'deposit' && Number.isFinite(ageMs) && ageMs >= rejectAfterMs) {
        resolved.set(transaction.id, {
          display_status: 'rejected',
          status_label: 'Rejected · absent from final API after 5h',
          status_source: 'statement_absence',
          statement_date: null,
        });
      } else {
        const fallback = stored.status_source === 'statement' || stored.status_source === 'statement_absence'
          ? storedReconciliation(null)
          : stored;
        resolved.set(transaction.id, fallback);
      }
    }
  }

  return transactions.map((transaction) => ({
    ...transaction,
    ...(resolved.get(transaction.id) ?? storedReconciliation(transaction.payment_status)),
  }));
}
