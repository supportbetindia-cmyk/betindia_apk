'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isValidPreset, resolveRange, type RangePreset } from '@/lib/console-range';

/**
 * The selected date range, kept in the URL (?preset=30d or ?preset=custom&from=&to=)
 * so it survives refresh, is shareable, and is preserved while navigating between
 * console pages. `from`/`to` in the URL are YYYY-MM-DD (human-readable).
 *
 * NOTE: a page using this must render inside a <Suspense> boundary (useSearchParams).
 */
export function useDateRange(defaultPreset: RangePreset = '30d', weekStartDay = 1) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawPreset = sp.get('preset');
  const preset: RangePreset = isValidPreset(rawPreset) ? rawPreset : defaultPreset;
  const from = sp.get('from') ?? undefined;
  const to = sp.get('to') ?? undefined;
  // Memoize so `range` (incl. its `to`=now snapshot) is STABLE across renders and only
  // recomputes when preset/from/to actually change. This makes it safe to put the range
  // in a React Query key — no more infinite-refetch loops from a live Date.now().
  const range = useMemo(() => resolveRange(preset, from, to, Date.now(), weekStartDay), [preset, from, to, weekStartDay]);

  const set = useCallback((nextPreset: RangePreset, customFrom?: string, customTo?: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set('preset', nextPreset);
    if (nextPreset === 'custom' && customFrom && customTo) {
      params.set('from', customFrom);
      params.set('to', customTo);
    } else {
      params.delete('from');
      params.delete('to');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [sp, router, pathname]);

  const reset = useCallback(() => {
    const params = new URLSearchParams(sp.toString());
    params.delete('preset');
    params.delete('from');
    params.delete('to');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [sp, router, pathname]);

  const isDefault = preset === defaultPreset;
  return { range, preset, set, reset, isDefault };
}
