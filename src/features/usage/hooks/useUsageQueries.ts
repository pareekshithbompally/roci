/** Usage from the store plugin: a page's window with its trend, and the same-length window before it.
 *  Query options are shared with prefetching, so a page opened from a hovered or tapped row already has its data. */

import { keepPreviousData, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { queryKeys } from '@shared/query/queryKeys';
import { getUsageSummary, type UsageQuery, type UsageSummary } from '@extensions/usage';
import type { UsageRange } from '@config/usage.config';
import { previousWindow, windowFor, type UsageWindow } from '@features/usage/model/period';
import { subjectFilter, type UsageSubject } from '@features/usage/model/subject';

/** Usage changes only when a request is logged, which invalidates every usage query; until then a result stays current. */
const summaryOptions = (query: UsageQuery) =>
  queryOptions({ queryKey: queryKeys.usage(query), queryFn: () => getUsageSummary(query), staleTime: Infinity });

/** The two queries a page reads: its window bucketed, and the window before it (none for all time). */
function pageQueries(subject: UsageSubject, range: UsageRange, now: Date) {
  const filter = subjectFilter(subject);
  const period = windowFor(range, now);
  const previous = previousWindow(range, now);
  return {
    period,
    current: summaryOptions({ since: period.since, until: period.until, bucket: period.bucket, ...filter }),
    previous: previous ? summaryOptions({ since: previous.since, until: previous.until, ...filter }) : null,
  };
}

/** What a page shows: a window with its own usage, never one window's dates with another's numbers. */
export interface UsageView {
  period: UsageWindow;
  /** Absent only during the page's very first load (the page keeps its frame meanwhile). */
  summary: UsageSummary | undefined;
  /** Null for all time; else the window before, `summary` absent until it arrives. */
  previous: null | { summary: UsageSummary | undefined };
  error: unknown;
}

/** A page's data. While a new range loads, the last settled window and its data stay together on screen. */
export function useUsagePage(subject: UsageSubject, range: UsageRange): UsageView {
  const q = pageQueries(subject, range, new Date());
  const current = useQuery({ ...q.current, placeholderData: keepPreviousData });
  const previous = useQuery({ ...(q.previous ?? summaryOptions({})), enabled: q.previous !== null });
  const fresh: UsageView = {
    period: q.period,
    summary: current.isPlaceholderData ? undefined : current.data,
    previous: q.previous ? { summary: previous.data } : null,
    error: current.error,
  };
  const settled = useRef<UsageView | null>(null);
  if (fresh.summary) settled.current = fresh;
  return current.isPlaceholderData && settled.current ? settled.current : fresh;
}

/** Starts loading a page's data before it opens (row hover or focus, or the tap that pushes it). */
export function usePrefetchUsagePage(): (subject: UsageSubject, range: UsageRange) => void {
  const queryClient = useQueryClient();
  return useCallback((subject, range) => {
    const q = pageQueries(subject, range, new Date());
    const failed = (error: unknown) => console.error('[usage] prefetch failed:', error);
    queryClient.prefetchQuery(q.current).catch(failed);
    if (q.previous) queryClient.prefetchQuery(q.previous).catch(failed);
  }, [queryClient]);
}
