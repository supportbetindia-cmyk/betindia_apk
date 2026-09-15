import { createHash } from 'node:crypto';

const TEMPLATES = {
  deposit: 'betindia_deposit_status_update',
  withdrawal: 'betindia_withdrawal_status_update',
} as const;

// Rejected deposits/withdrawals use dedicated templates (8 variables each) so the
// wording is a proper "could not be approved" notice — not the status_update one.
const REJECTED_TEMPLATES = {
  deposit: 'deposit_rejected',
  withdrawal: 'withdrawal_rejected',
} as const;

const IST_DATE_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const IST_TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

/** Rejected when the platform's status says reject/fail/cancel/decline. Checked
 * BEFORE approved because "reject_completed" also contains "complet". */
function isRejectedStatus(status: string): boolean {
  return /reject|fail|cancel|declin/.test(status.toLowerCase());
}

export type TransactionAutomationType = keyof typeof TEMPLATES;

export type AutomationMessage = {
  eventKey: string;
  type: TransactionAutomationType;
  templateName: string;
  transactionId: string;
  transactionStatus: string;
  mobile: string;
  countryCode: string;
  userId: string;
  bodyValues: string[];
};

function pick(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') return String(value).trim();
  }
  return '';
}

export function normalizePhone(raw: string): { countryCode: string; phoneNumber: string } | null {
  const digits = raw.replace(/\D/g, '');
  let local: string | null = null;
  if (digits.length === 10) local = digits;
  else if (digits.length === 11 && digits.startsWith('0')) local = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) local = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith('910')) local = digits.slice(3);
  else if (digits.length > 10) local = digits.slice(-10); // best-effort: last 10 digits
  // Indian mobile numbers are exactly 10 digits and start 6-9.
  if (!local || !/^[6-9]\d{9}$/.test(local)) return null;
  return { countryCode: '+91', phoneNumber: local };
}

function statusLine(type: TransactionAutomationType, status: string): string {
  const normalized = status.toLowerCase();
  // Check rejected FIRST: the platform's rejected status is "reject_completed",
  // which also contains "complet" — so approved must NOT win over rejected.
  const rejected = /reject|fail|cancel|declin/.test(normalized);
  const approved = !rejected && /approv|success|complet|credit/.test(normalized);
  if (type === 'withdrawal') {
    if (rejected) return 'Your withdrawal could not be processed. Please contact support.';
    if (approved) return 'Your withdrawal has been processed successfully.';
    return 'Your withdrawal is being processed. We will update you shortly.';
  }
  if (rejected) return 'Your deposit could not be processed. Please contact support.';
  if (approved) return 'Your deposit has been added to your wallet. Good luck!';
  return 'Your deposit is being processed.';
}

function normalizedStatus(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, '_') || 'unknown';
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

export function automationEventKey(
  type: TransactionAutomationType,
  transactionId: string,
  status: string,
  templateName: string,
  fallbackPayload: Record<string, unknown>
): string {
  const transactionIdentity = transactionId || createHash('sha256')
    .update(JSON.stringify(stableValue(fallbackPayload)))
    .digest('hex');
  const digest = createHash('sha256')
    .update(`${type}|${transactionIdentity}|${normalizedStatus(status)}|${templateName}`)
    .digest('hex');
  return `whatsapp:${type}:${digest}`;
}

export function buildAutomationMessage(
  type: TransactionAutomationType,
  body: Record<string, unknown>
): AutomationMessage | null {
  const mobileRaw = pick(body, 'mobile_number', 'Mobile_number');
  const phone = mobileRaw ? normalizePhone(mobileRaw) : null;
  if (!phone) return null;

  const name = pick(body, 'User_name', 'user_name') || 'Customer';
  const userId = pick(body, 'user_id', 'User_id');
  const amount = pick(body, 'Amount', 'amount');
  const transactionId = pick(body, 'Transaction_id', 'transaction_id');
  const transactionStatus = pick(body, 'payment_status', 'Payment_status');
  const remarks = pick(body, 'remarks', 'Remarks');

  const rejected = isRejectedStatus(transactionStatus);
  const templateName = rejected ? REJECTED_TEMPLATES[type] : TEMPLATES[type];
  const now = new Date();
  const bodyValues = rejected
    // Rejected template (8 vars): name, userId, amount, currency, txnId, date, time, reason.
    ? [
        name,
        userId,
        amount,
        'INR',
        transactionId,
        IST_DATE_FMT.format(now),
        IST_TIME_FMT.format(now).toUpperCase(),
        remarks || 'Not specified',
      ]
    // Approved / pending status_update template (6 vars): unchanged.
    : [
        name,
        userId,
        amount,
        transactionId,
        transactionStatus,
        remarks || statusLine(type, transactionStatus),
      ];

  return {
    eventKey: automationEventKey(type, transactionId, transactionStatus, templateName, body),
    type,
    templateName,
    transactionId,
    transactionStatus,
    mobile: phone.phoneNumber,
    countryCode: phone.countryCode,
    userId,
    bodyValues,
  };
}

export type SkippedDescriptor = {
  type: TransactionAutomationType;
  templateName: string;
  eventKey: string;
  transactionId: string;
  transactionStatus: string;
  mobile: string;
  userId: string;
};

/** Build enough context to log a *dropped* event (e.g. an unusable phone number)
 * so it never disappears silently. Deduped by a distinct "skipped:" event key. */
export function describeSkippedMessage(
  type: TransactionAutomationType,
  body: Record<string, unknown>,
  reason: string
): SkippedDescriptor {
  const mobile = pick(body, 'mobile_number', 'Mobile_number');
  const userId = pick(body, 'user_id', 'User_id');
  const transactionId = pick(body, 'Transaction_id', 'transaction_id');
  const transactionStatus = pick(body, 'payment_status', 'Payment_status');
  const templateName = TEMPLATES[type];
  return {
    type,
    templateName,
    eventKey: automationEventKey(type, transactionId, `skipped:${reason}`, templateName, body),
    transactionId,
    transactionStatus,
    mobile: mobile || 'unknown',
    userId,
  };
}

