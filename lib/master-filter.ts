/** Use the same query parameter for navigation and API requests. */
export function withMaster(href: string, masterId: string): string {
  const url = new URL(href, 'http://dashboard.local');
  if (masterId) url.searchParams.set('masterId', masterId);
  else url.searchParams.delete('masterId');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseMasterId(params: URLSearchParams): string | undefined {
  const values = params.getAll('masterId');
  if (values.length > 1 || (values[0] && (values[0].length > 128 || /[\x00-\x1f\x7f]/.test(values[0])))) {
    throw new Error('Invalid masterId: provide a single ID of at most 128 characters');
  }
  return values[0]?.trim() || undefined;
}

export function isRealMaster(value: string | null | undefined): value is string {
  return Boolean(value?.trim()) && value !== 'statement-api' && !value!.startsWith('statement:');
}

/** Current customer assignment wins; transaction metadata is a fallback only.
 * This also keeps statement-synced transactions, whose branch is synthetic. */
export function scopeMasterRows<U extends { user_id: string; branch_id?: string | null }, T extends { user_id: string | null; branch_id?: string | null }>(
  users: U[], transactions: T[], masterId?: string,
): { users: U[]; transactions: T[] } {
  if (!masterId) return { users, transactions };
  const assignments = new Map<string, string>();
  for (const user of users) {
    if (isRealMaster(user.branch_id)) assignments.set(user.user_id, user.branch_id);
  }
  for (const txn of transactions) {
    if (txn.user_id && !assignments.has(txn.user_id) && isRealMaster(txn.branch_id)) {
      assignments.set(txn.user_id, txn.branch_id);
    }
  }
  return {
    users: users.filter((user) => assignments.get(user.user_id) === masterId),
    transactions: transactions.filter((txn) => txn.user_id && assignments.get(txn.user_id) === masterId),
  };
}
