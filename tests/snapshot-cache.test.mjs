import assert from 'node:assert/strict';
import test from 'node:test';
import { SnapshotCache } from '../lib/snapshot-cache.ts';

test('reuses a fresh snapshot without calling the loader again', async () => {
  let now = 1_000;
  let loads = 0;
  const cache = new SnapshotCache(
    async () => ({ value: ++loads }),
    { ttlMs: 100, staleTtlMs: 1_000, now: () => now }
  );

  const first = await cache.get();
  now += 50;
  const second = await cache.get();

  assert.equal(first.state, 'miss');
  assert.equal(second.state, 'hit');
  assert.deepEqual(second.data, { value: 1 });
  assert.equal(loads, 1);
});

test('deduplicates concurrent snapshot loads', async () => {
  let release;
  let loads = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const cache = new SnapshotCache(
    async () => {
      loads += 1;
      await gate;
      return { value: 7 };
    },
    { ttlMs: 100, staleTtlMs: 1_000 }
  );

  const firstPromise = cache.get();
  const secondPromise = cache.get();
  release();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.equal(loads, 1);
  assert.equal(first.state, 'miss');
  assert.equal(second.state, 'shared');
  assert.deepEqual(second.data, { value: 7 });
});

test('serves the last good snapshot during a short loader failure', async () => {
  let now = 1_000;
  let fail = false;
  const cache = new SnapshotCache(
    async () => {
      if (fail) throw new Error('temporary upstream failure');
      return { value: 9 };
    },
    { ttlMs: 100, staleTtlMs: 1_000, now: () => now }
  );

  await cache.get();
  now += 101;
  fail = true;
  const fallback = await cache.get();

  assert.equal(fallback.state, 'stale');
  assert.deepEqual(fallback.data, { value: 9 });
  assert.equal(fallback.generatedAt, 1_000);
});
