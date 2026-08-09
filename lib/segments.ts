import { fetchTransactions, type TransactionRow } from './wati';

// Customer-intelligence segmentation. Built from the transactions table because
// that's where phone numbers live (WhatsApp needs a number to message). Each
// user is keyed by mobile_number (fallback user_id). Analytics events are
// anonymous device_ids and can't be messaged, so they're not used here.

export type SegmentUser = {
  key: string; // mobile_number (or user_id)
  userId: string | null;
  userName: string | null;
  mobile: string | null;
  depositCount: number;
  depositTotal: number; // approved deposits only
  withdrawalCount: number;
  lastActivity: string | null; // ISO
};

export type SegmentKey =
  | 'all_depositors'
  | 'ftd'
  | 'repeat_depositors'
  | 'vip'
  | 'inactive_depositors'
  | 'withdrawal_users';

export type Segment = { key: SegmentKey; label: string; count: number; users: SegmentUser[] };

export type SegmentOptions = {
  vipThreshold?: number; // total approved deposits to qualify as VIP
  inactiveDays?: number; // no activity within N days => inactive
};

const isApproved = (s: string | null) => /approv|success|complet/i.test(s ?? '');
const DAY = 24 * 60 * 60 * 1000;

/** Aggregate raw transaction rows into per-user profiles. */
export function buildUserProfiles(txns: TransactionRow[]): Map<string, SegmentUser> {
  const users = new Map<string, SegmentUser>();

  for (const t of txns) {
    const key = t.mobile_number || t.user_id;
    if (!key) continue;

    let u = users.get(key);
    if (!u) {
      u = {
        key,
        userId: t.user_id,
        userName: t.user_name,
        mobile: t.mobile_number,
        depositCount: 0,
        depositTotal: 0,
        withdrawalCount: 0,
        lastActivity: null,
      };
      users.set(key, u);
    }

    // Prefer non-null identity fields as we see them.
    u.userName = u.userName || t.user_name;
    u.mobile = u.mobile || t.mobile_number;

    if (t.type === 'deposit' && isApproved(t.payment_status)) {
      u.depositCount += 1;
      u.depositTotal += t.amount ?? 0;
    }
    if (t.type === 'withdrawal') {
      u.withdrawalCount += 1;
    }

    if (!u.lastActivity || t.created_at > u.lastActivity) u.lastActivity = t.created_at;
  }

  return users;
}

/** Derive the named segments from user profiles. */
export function computeSegments(txns: TransactionRow[], opts: SegmentOptions = {}): Segment[] {
  const vipThreshold = opts.vipThreshold ?? 50000;
  const inactiveDays = opts.inactiveDays ?? 7;
  const now = Date.now();

  const profiles = [...buildUserProfiles(txns).values()];
  const isInactive = (u: SegmentUser) =>
    u.lastActivity != null && now - new Date(u.lastActivity).getTime() > inactiveDays * DAY;

  const seg = (key: SegmentKey, label: string, filter: (u: SegmentUser) => boolean): Segment => {
    const users = profiles.filter(filter).sort((a, b) => b.depositTotal - a.depositTotal);
    return { key, label, count: users.length, users };
  };

  return [
    seg('all_depositors', 'All Depositors', (u) => u.depositCount >= 1),
    seg('ftd', 'First-Time Depositors (FTD)', (u) => u.depositCount === 1),
    seg('repeat_depositors', 'Repeat Depositors', (u) => u.depositCount >= 2),
    seg('vip', `VIP (≥ ₹${vipThreshold.toLocaleString()})`, (u) => u.depositTotal >= vipThreshold),
    seg('inactive_depositors', `Inactive Depositors (${inactiveDays}d)`, (u) => u.depositCount >= 1 && isInactive(u)),
    seg('withdrawal_users', 'Withdrawal Users', (u) => u.withdrawalCount >= 1),
  ];
}

/** Fetch transactions and compute segments in one call (for API routes). */
export async function getSegments(opts?: SegmentOptions): Promise<Segment[]> {
  const txns = await fetchTransactions(2000);
  return computeSegments(txns, opts);
}
