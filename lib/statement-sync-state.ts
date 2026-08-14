export type SyncCursor = {
  lastUserId: string | null;
  cycleProcessed: number;
  completedCycles: number;
};

export type SelectedSyncBatch = {
  users: string[];
  startIndex: number;
  reachedEnd: boolean;
};


export function selectStatementSyncBatch(
  userIds: string[],
  cursor: SyncCursor,
  batchSize: number
): SelectedSyncBatch {
  const users = [...new Set(userIds.filter(Boolean))].sort();
  if (users.length === 0 || batchSize <= 0) {
    return { users: [], startIndex: 0, reachedEnd: users.length === 0 };
  }

  let startIndex = 0;
  if (cursor.lastUserId) {
    const nextIndex = users.findIndex((userId) => userId > cursor.lastUserId!);
    startIndex = nextIndex >= 0 ? nextIndex : 0;
  }

  const selected = users.slice(startIndex, startIndex + batchSize);
  return {
    users: selected,
    startIndex,
    reachedEnd: startIndex + selected.length >= users.length,
  };
}

export function advanceStatementSyncCursor(
  cursor: SyncCursor,
  batch: SelectedSyncBatch
): SyncCursor {
  if (batch.users.length === 0) return cursor;
  if (batch.reachedEnd) {
    return {
      lastUserId: null,
      cycleProcessed: 0,
      completedCycles: cursor.completedCycles + 1,
    };
  }
  return {
    lastUserId: batch.users[batch.users.length - 1],
    cycleProcessed: cursor.cycleProcessed + batch.users.length,
    completedCycles: cursor.completedCycles,
  };
}

