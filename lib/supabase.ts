// Server-side Supabase reader. Uses the service_role key, which bypasses RLS,
// so this module must NEVER be imported into a client component. It is only
// used from the /api/metrics route handler (server runtime).

export type AnalyticsEvent = {
  id: number;
  event_name: string;
  created_at: string;
  device_id: string | null;
  session_id: string | null;
  properties: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PLACEHOLDER = 'your_service_role_key_here';
const PAGE_SIZE = 1_000;
const PAGE_CONCURRENCY = 5;
const DEFAULT_MAX_EVENTS = 100_000;

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_ROLE && SERVICE_ROLE !== PLACEHOLDER);
}

export type FetchEventsOptions = {
  limit?: number;
  from?: string;
  to?: string;
};

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : fallback;
}

function totalFromContentRange(value: string | null): number | null {
  const match = /\/(\d+)$/.exec(value ?? '');
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isFinite(total) ? total : null;
}

async function fetchEventPage(params: URLSearchParams, includeCount = false): Promise<{
  rows: AnalyticsEvent[];
  total: number | null;
}> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${params.toString()}`, {
    headers: {
      apikey: SERVICE_ROLE as string,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      ...(includeCount ? { Prefer: 'count=exact' } : {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase read failed (${res.status}): ${body}`);
  }

  return {
    rows: (await res.json()) as AnalyticsEvent[],
    total: totalFromContentRange(res.headers.get('content-range')),
  };
}

/** Fetch events newest-first, optionally restricted to a server-side window. */
export async function fetchEvents(options: FetchEventsOptions = {}): Promise<AnalyticsEvent[]> {
  if (!isConfigured()) {
    throw new Error(
      'Dashboard not configured: set SUPABASE_URL and a real SUPABASE_SERVICE_ROLE_KEY in dashboard/.env.local'
    );
  }

  const maxEvents = positiveInteger(options.limit, DEFAULT_MAX_EVENTS);
  const pageLimit = Math.min(PAGE_SIZE, maxEvents);
  const baseParams = new URLSearchParams({
    select: 'id,event_name,created_at,device_id,session_id,properties,context',
    order: 'created_at.desc',
  });
  if (options.from) baseParams.append('created_at', `gte.${options.from}`);
  if (options.to) baseParams.append('created_at', `lt.${options.to}`);

  const firstParams = new URLSearchParams(baseParams);
  firstParams.set('limit', String(pageLimit));
  firstParams.set('offset', '0');
  const first = await fetchEventPage(firstParams, true);
  if (first.rows.length < pageLimit || first.rows.length >= maxEvents) return first.rows.slice(0, maxEvents);

  const available = first.total ?? maxEvents;
  const targetCount = Math.min(available, maxEvents);
  const offsets: number[] = [];
  for (let offset = pageLimit; offset < targetCount; offset += PAGE_SIZE) offsets.push(offset);

  const pages: AnalyticsEvent[][] = [];
  for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
    const batch = offsets.slice(index, index + PAGE_CONCURRENCY);
    const loaded = await Promise.all(batch.map(async (offset) => {
      const params = new URLSearchParams(baseParams);
      params.set('limit', String(Math.min(PAGE_SIZE, targetCount - offset)));
      params.set('offset', String(offset));
      return (await fetchEventPage(params)).rows;
    }));
    pages.push(...loaded);
  }

  return [...first.rows, ...pages.flat()].slice(0, targetCount);
}
