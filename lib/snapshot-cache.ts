export type SnapshotState = 'miss' | 'hit' | 'shared' | 'stale';

export type Snapshot<T> = {
  data: T;
  generatedAt: number;
  state: SnapshotState;
};

type CacheOptions = {
  ttlMs: number;
  staleTtlMs: number;
  now?: () => number;
};

/**
 * Small in-process cache for expensive server-side snapshots.
 *
 * Concurrent callers share one load. If a refresh fails, the most recent
 * successful value can be served briefly so a transient upstream problem does
 * not blank the dashboard.
 */
export class SnapshotCache<T> {
  private cached: { data: T; generatedAt: number } | null = null;
  private inFlight: Promise<Snapshot<T>> | null = null;
  private readonly loader: () => Promise<T>;
  private readonly options: CacheOptions;
  private readonly now: () => number;

  constructor(loader: () => Promise<T>, options: CacheOptions) {
    this.loader = loader;
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  async get(): Promise<Snapshot<T>> {
    const current = this.cached;
    if (current && this.now() - current.generatedAt < this.options.ttlMs) {
      return { ...current, state: 'hit' };
    }

    if (this.inFlight) {
      const snapshot = await this.inFlight;
      return {
        ...snapshot,
        state: snapshot.state === 'stale' ? 'stale' : 'shared',
      };
    }

    const pending = this.load();
    this.inFlight = pending;
    try {
      return await pending;
    } finally {
      if (this.inFlight === pending) this.inFlight = null;
    }
  }

  private async load(): Promise<Snapshot<T>> {
    try {
      const data = await this.loader();
      const generatedAt = this.now();
      this.cached = { data, generatedAt };
      return { data, generatedAt, state: 'miss' };
    } catch (error) {
      const current = this.cached;
      if (current && this.now() - current.generatedAt < this.options.staleTtlMs) {
        return { ...current, state: 'stale' };
      }
      throw error;
    }
  }
}
