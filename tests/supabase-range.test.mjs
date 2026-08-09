import assert from 'node:assert/strict';
import test from 'node:test';

test('adds the selected timestamp window to the Supabase request', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  const { fetchEvents } = await import('../lib/supabase.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await fetchEvents({
      limit: 123,
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('limit'), '123');
  assert.equal(url.searchParams.get('offset'), '0');
  assert.deepEqual(url.searchParams.getAll('created_at'), [
    'gte.2026-07-01T00:00:00.000Z',
    'lt.2026-08-01T00:00:00.000Z',
  ]);
});

test('paginates beyond the Supabase 1000-row response cap', async () => {
  const { fetchEvents } = await import('../lib/supabase.ts');
  const originalFetch = globalThis.fetch;
  const requestedOffsets = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    requestedOffsets.push(offset);
    const count = Math.min(limit, 2_505 - offset);
    const rows = Array.from({ length: Math.max(0, count) }, (_, index) => ({
      id: offset + index + 1,
      event_name: 'app_open',
      created_at: '2026-08-08T00:00:00.000Z',
      device_id: `device-${offset + index + 1}`,
      session_id: null,
      properties: {},
      context: {},
    }));
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': `${offset}-${offset + rows.length - 1}/2505`,
      },
    });
  };

  try {
    const events = await fetchEvents({ limit: 5_000 });
    assert.equal(events.length, 2_505);
    assert.deepEqual(requestedOffsets, [0, 1000, 2000]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
