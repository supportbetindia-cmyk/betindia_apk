// Server-side helpers for the WATI deposit/withdrawal webhook. Writes with the
// service_role key, so import only from route handlers (never a client file).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!SERVICE_ROLE) return extra;
  return {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    ...extra,
  };
}

export type TxnType = 'deposit' | 'withdrawal';
export type TransactionRow = {
  id: number;
  type: TxnType;
  transaction_id: string | null;
  branch_id: string | null;
  user_id: string | null;
  user_name: string | null;
  mobile_number: string | null;
  amount: number | null;
  payment_status: string | null;
  utr_number: string | null;
  account_number: string | null;
  holder_name: string | null;
  ifsc_code: string | null;
  image: string | null;
  remarks: string | null;
  created_at: string;
};

/**
 * Parse an incoming webhook body regardless of content-type. Payment platforms
 * send JSON, x-www-form-urlencoded, or multipart — our old code only accepted
 * JSON and silently 400'd everything else. This accepts all of them.
 */
export async function parseWebhookBody(req: Request): Promise<Record<string, unknown>> {
  const ct = (req.headers.get('content-type') || '').toLowerCase();

  if (ct.includes('application/json')) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }

  if (ct.includes('form-urlencoded') || ct.includes('multipart/form-data')) {
    const form = await req.formData();
    const obj: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) obj[k] = typeof v === 'string' ? v : String(v);
    return obj;
  }

  // Unknown/missing content-type: try JSON text, then urlencoded text.
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    const obj: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return Object.keys(obj).length ? obj : { _raw: text.slice(0, 500) };
  }
}

/** Read the first present key (payloads mix Capitalised and lower_case names). */
function pick(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return null;
}

/** Map an incoming WATI payload to a transactions row and upsert it. */
export async function saveTransaction(type: TxnType, body: Record<string, unknown>): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');

  const amountRaw = pick(body, 'Amount', 'amount');
  const record = {
    type,
    transaction_id: pick(body, 'Transaction_id', 'transaction_id'),
    branch_id: pick(body, 'Branch_id', 'branch_id'),
    user_id: pick(body, 'user_id', 'User_id'),
    user_name: pick(body, 'User_name', 'user_name'),
    mobile_number: pick(body, 'mobile_number', 'Mobile_number'),
    amount: amountRaw !== null && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null,
    payment_status: pick(body, 'payment_status', 'Payment_status'),
    utr_number: pick(body, 'utr_number', 'Utr_number'),
    account_number: pick(body, 'Account_number', 'account_number'),
    holder_name: pick(body, 'holder_name', 'Holder_name'),
    ifsc_code: pick(body, 'Ifsc_code', 'ifsc_code'),
    image: pick(body, 'image', 'Image'),
    remarks: pick(body, 'remarks', 'Remarks'),
    raw: body,
    updated_at: new Date().toISOString(),
  };

  // Upsert on (type, transaction_id, branch_id) so a status update replaces.
  const url = `${SUPABASE_URL}/rest/v1/transactions?on_conflict=type,transaction_id,branch_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(record),
  });

  if (!res.ok) {
    throw new Error(`Supabase upsert failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Record every webhook hit (success or reject) so activity is visible in the
 * dashboard. Never throws — logging must not break the webhook itself. */
export async function logWebhookHit(entry: {
  source: string;
  method: string;
  contentType: string;
  tokenOk: boolean;
  status: number;
  ip?: string | null;
  raw?: unknown;
}): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/webhook_logs`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        source: entry.source,
        method: entry.method,
        content_type: entry.contentType,
        token_ok: entry.tokenOk,
        status: entry.status,
        ip: entry.ip ?? null,
        raw: entry.raw ?? null,
      }),
    });
  } catch {
    /* logging is best-effort */
  }
}

/** Read recent webhook hits for the dashboard. */
export async function fetchWebhookLogs(limit = 50): Promise<Record<string, unknown>[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const params = new URLSearchParams({
    select: '*',
    source: 'in.(deposit,withdrawal)',
    order: 'created_at.desc',
    limit: String(limit),
  });
  const url = `${SUPABASE_URL}/rest/v1/webhook_logs?${params.toString()}`;
  const res = await fetch(url, {
    headers: supabaseHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** Read recent transactions for the dashboard (service_role). */
export async function fetchTransactions(limit = 200): Promise<TransactionRow[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const url = `${SUPABASE_URL}/rest/v1/transactions?select=*&order=created_at.desc&limit=${limit}`;
  const res = await fetch(url, {
    headers: supabaseHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TransactionRow[];
}

/** Read every distinct user known from transaction webhooks. */
export async function fetchKnownTransactionUserIds(limit = 10_000): Promise<string[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const params = new URLSearchParams({
    select: 'user_id',
    user_id: 'not.is.null',
    limit: String(limit),
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${params.toString()}`, {
    headers: supabaseHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase user read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as Array<{ user_id: string | null }>;
  return [...new Set(rows.map((row) => row.user_id?.trim()).filter((value): value is string => Boolean(value)))].sort();
}

/** Read all stored transaction requests for one user before reconciling them. */
export async function fetchTransactionsForUser(userId: string, limit = 1_000): Promise<TransactionRow[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const params = new URLSearchParams({
    select: '*',
    user_id: `eq.${userId}`,
    order: 'created_at.asc',
    limit: String(limit),
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${params.toString()}`, {
    headers: supabaseHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase transaction read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TransactionRow[];
}

/** Persist a statement-derived final status on the original webhook request. */
export async function updateTransactionPaymentStatus(id: number, paymentStatus: string | null): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const params = new URLSearchParams({ id: `eq.${id}` });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${params.toString()}`, {
    method: 'PATCH',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify({ payment_status: paymentStatus, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase status update failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export type StatementWithdrawalRecord = {
  transactionId: string;
  userId: string;
  branchId: string | null;
  userName: string | null;
  mobileNumber: string | null;
  amount: number;
  statementDate: string;
  createdAt: string;
  entry: Record<string, unknown>;
};

/** Save settled withdrawals so totals remain complete between server restarts. */
export async function upsertStatementWithdrawal(record: StatementWithdrawalRecord): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const params = new URLSearchParams({ on_conflict: 'type,transaction_id,branch_id' });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/transactions?${params.toString()}`, {
    method: 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      type: 'withdrawal',
      transaction_id: record.transactionId,
      branch_id: 'statement-api',
      user_id: record.userId,
      user_name: record.userName,
      mobile_number: record.mobileNumber,
      amount: record.amount,
      payment_status: 'Approved - statement',
      remarks: 'Settled withdrawal discovered in wallet statement',
      raw: {
        source: 'statement_api',
        statement_date: record.statementDate,
        entry: record.entry,
      },
      created_at: record.createdAt,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Supabase statement withdrawal upsert failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export type StatementSyncState = {
  id?: number;
  lastUserId: string | null;
  cycleProcessed: number;
  completedCycles: number;
  lastRunAt: string | null;
};

/** The cursor lives in webhook_logs so this upgrade needs no new database table. */
export async function fetchStatementSyncState(): Promise<StatementSyncState> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const params = new URLSearchParams({
    select: 'id,raw',
    source: 'eq.statement_sync_cursor',
    order: 'created_at.desc',
    limit: '1',
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/webhook_logs?${params.toString()}`, {
    headers: supabaseHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase sync-state read failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as Array<{ id: number; raw: Record<string, unknown> | null }>;
  const row = rows[0];
  const raw = row?.raw ?? {};
  return {
    id: row?.id,
    lastUserId: typeof raw.last_user_id === 'string' ? raw.last_user_id : null,
    cycleProcessed: Number(raw.cycle_processed) || 0,
    completedCycles: Number(raw.completed_cycles) || 0,
    lastRunAt: typeof raw.last_run_at === 'string' ? raw.last_run_at : null,
  };
}

export async function saveStatementSyncState(state: StatementSyncState): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Supabase not configured');
  const payload = {
    source: 'statement_sync_cursor',
    method: 'SYNC',
    content_type: 'application/json',
    token_ok: true,
    status: 200,
    raw: {
      last_user_id: state.lastUserId,
      cycle_processed: state.cycleProcessed,
      completed_cycles: state.completedCycles,
      last_run_at: state.lastRunAt,
    },
  };
  const url = state.id
    ? `${SUPABASE_URL}/rest/v1/webhook_logs?${new URLSearchParams({ id: `eq.${state.id}` }).toString()}`
    : `${SUPABASE_URL}/rest/v1/webhook_logs`;
  const res = await fetch(url, {
    method: state.id ? 'PATCH' : 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Supabase sync-state write failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
