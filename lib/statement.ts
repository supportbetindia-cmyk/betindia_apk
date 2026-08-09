import type { TransactionRow } from './wati';
import {
  reconcileUserTransactions,
  parseStatementDate,
  statementEntryMatchesTransaction,
  storedReconciliation,
  type Reconciliation,
  type StatementEntry,
} from './transaction-reconciliation';

const API_URL = process.env.STATEMENT_API_URL;
const API_TOKEN = process.env.STATEMENT_API_TOKEN;
const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_USERS_PER_REFRESH = 25;
const CONCURRENCY = 5;

type CachedStatement = { expiresAt: number; entries: StatementEntry[] };
const cache = new Map<string, CachedStatement>();
const inFlight = new Map<string, Promise<StatementEntry[]>>();

export type ReconciledTransaction = TransactionRow & Reconciliation & {
  statement_only?: boolean;
};

export type ReconciliationResult = {
  rows: ReconciledTransaction[];
  configured: boolean;
  checkedUsers: number;
  failedUsers: number;
  limited: boolean;
};

/** Decorate already-synced database rows without making external API calls. */
export function reconcileStoredTransactions(rows: TransactionRow[]): ReconciledTransaction[] {
  return rows
    .map((row) => ({
      ...row,
      ...storedReconciliation(row.payment_status),
      statement_only: row.branch_id === 'statement-api' || row.transaction_id?.startsWith('statement:') === true,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function statementConfigured(): boolean {
  return Boolean(API_URL && API_TOKEN);
}

function syntheticId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return -Math.max(1, Math.abs(hash));
}

function statementWithdrawalRow(
  userId: string,
  userRows: TransactionRow[],
  entry: StatementEntry,
  index: number
): ReconciledTransaction {
  const identity = userRows.find((row) => row.user_name || row.mobile_number) ?? userRows[0];
  const statementTime = parseStatementDate(entry.date);
  return {
    id: syntheticId(`${userId}|${entry.date}|${entry.pnl}|${index}`),
    type: 'withdrawal',
    transaction_id: null,
    branch_id: identity?.branch_id ?? null,
    user_id: userId,
    user_name: identity?.user_name ?? null,
    mobile_number: identity?.mobile_number ?? null,
    amount: Math.abs(Number(entry.pnl)),
    payment_status: 'Approved (statement only)',
    utr_number: null,
    account_number: null,
    holder_name: null,
    ifsc_code: null,
    image: null,
    remarks: 'Settled withdrawal discovered in wallet statement',
    created_at: Number.isFinite(statementTime) ? new Date(statementTime).toISOString() : entry.date,
    display_status: 'approved',
    status_label: 'Approved · statement',
    status_source: 'statement',
    statement_date: entry.date,
    statement_only: true,
  };
}

function isStatementEntry(value: unknown): value is StatementEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['description', 'pnl', 'date', 'type'].every((key) => typeof entry[key] === 'string');
}

async function requestStatement(userId: string): Promise<StatementEntry[]> {
  if (!API_URL || !API_TOKEN) throw new Error('Statement API not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL.replace(/\/$/, '')}/statement`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Statement API request failed (${response.status})`);
    const payload = await response.json() as {
      success?: boolean;
      result?: { data?: unknown[] };
    };
    if (payload.success !== true || !Array.isArray(payload.result?.data)) {
      throw new Error('Statement API returned an invalid response');
    }
    return payload.result.data.filter(isStatementEntry);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchStatement(userId: string): Promise<StatementEntry[]> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.entries;
  const pending = inFlight.get(userId);
  if (pending) return pending;

  const request = requestStatement(userId).then((entries) => {
    if (cache.size >= 500) cache.clear();
    cache.set(userId, { entries, expiresAt: Date.now() + CACHE_TTL_MS });
    return entries;
  }).finally(() => {
    inFlight.delete(userId);
  });
  inFlight.set(userId, request);
  return request;
}

async function mapWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function reconcileTransactions(rows: TransactionRow[]): Promise<ReconciliationResult> {
  const fallbackRows = reconcileStoredTransactions(rows);
  if (!statementConfigured()) {
    return { rows: fallbackRows, configured: false, checkedUsers: 0, failedUsers: 0, limited: false };
  }

  const candidateUserIds: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.user_id || seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    candidateUserIds.push(row.user_id);
  }
  const selectedUserIds = candidateUserIds.slice(0, MAX_USERS_PER_REFRESH);
  const reconciledById = new Map<number, ReconciledTransaction>();
  const statementOnlyWithdrawals: ReconciledTransaction[] = [];
  let checkedUsers = 0;
  let failedUsers = 0;

  await mapWithConcurrency(selectedUserIds, async (userId) => {
    try {
      const entries = await fetchStatement(userId);
      const userRows = rows.filter((row) => row.user_id === userId);
      for (const row of reconcileUserTransactions(userRows, entries)) reconciledById.set(row.id, row);
      const storedWithdrawals = userRows.filter((row) => row.type === 'withdrawal');
      entries.forEach((entry, index) => {
        if (entry.type !== 'auto_withdrawal') return;
        const alreadyStored = storedWithdrawals.some((row) => statementEntryMatchesTransaction(row, entry));
        if (!alreadyStored) statementOnlyWithdrawals.push(statementWithdrawalRow(userId, userRows, entry, index));
      });
      checkedUsers++;
    } catch {
      failedUsers++;
    }
  });

  const reconciledRows = [
    ...fallbackRows.map((row) => reconciledById.get(row.id) ?? row),
    ...statementOnlyWithdrawals,
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    rows: reconciledRows,
    configured: true,
    checkedUsers,
    failedUsers,
    limited: candidateUserIds.length > selectedUserIds.length,
  };
}
