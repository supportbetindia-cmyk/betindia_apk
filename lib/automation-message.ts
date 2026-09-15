import { createHash } from 'node:crypto';

// ============================================================================
// WhatsApp template names, by transaction TYPE and OUTCOME.
// >>> TO CHANGE A TEMPLATE NAME, EDIT IT HERE <<< (must match the EXACT template
//     name approved on Interakt). Nothing else needs to change.
//
// Variables sent to every template:
//   {{1}} name  {{2}} userId  {{3}} amount  {{4}} currency(INR)
//   {{5}} transactionId  {{6}} date  {{7}} time
// The REJECTED templates take one extra variable: {{8}} reason.
// ============================================================================
const TEMPLATES = {
  deposit: {
    approved: 'deposit_approved',
    pending: 'deposit_request_received_dk',
    rejected: 'deposit_rejected',
  },
  withdrawal: {
    approved: 'withdrawal_approved',
    pending: 'withdrawal_request_received',
    rejected: 'withdrawal_rejected',
  },
} as const;

export type TransactionAutomationType = keyof typeof TEMPLATES;
type Outcome = 'approved' | 'pending' | 'rejected';

const IST_DATE_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const IST_TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

/** Map a platform status to an outcome. Rejected is checked FIRST because
 * "reject_completed" also contains "complet" (which the approved test matches). */
function classifyOutcome(status: string): Outcome {
  const s = status.toLowerCase();
  if (/reject|fail|cancel|declin/.test(s)) return 'rejected';
  if (/approv|success|complet|credit/.test(s)) return 'approved';
  return 'pending';
}

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

  const outcome = classifyOutcome(transactionStatus);
  const templateName = TEMPLATES[type][outcome];
  const now = new Date();
  // Every template shares these 7 vars; rejected adds an 8th (reason).
  const base = [
    name,
    userId,
    amount,
    'INR',
    transactionId,
    IST_DATE_FMT.format(now),
    IST_TIME_FMT.format(now).toUpperCase(),
  ];
  const bodyValues = outcome === 'rejected' ? [...base, remarks || 'Not specified'] : base;

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
  const templateName = TEMPLATES[type][classifyOutcome(transactionStatus)];
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

