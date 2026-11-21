/** Usage from the store plugin: a range's window by day (or month), the window before it, and every model ever used. */

import { useMemo } from 'react';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { localDayKey } from '@shared/utils/localDate';
import { queryKeys } from '@shared/query/queryKeys';
import { getUsageSummary, type UsageQuery, type UsageSummary } from '@extensions/usage';
import type { UsageRange } from '@config/usage.config';
import { previousWindow, windowFor, type UsageWindow } from '@features/usage/model/period';

/** Usage changes only when a request is logged, which invalidates every usage query; until then a result stays current. */
const summaryOptions = (query: UsageQuery) =>
  queryOptions({ queryKey: queryKeys.usage(query), queryFn: () => getUsageSummary(query), staleTime: Infinity });

interface UsageView {
  period: UsageWindow;
  summary: UsageSummary | undefined;
  /** The window before, for each KPI's change; null for all time. */
  previous: UsageSummary | undefined | null;
  isLoading: boolean;
  error: unknown;
}

/** A range's usage; while a new range loads, the last one stays on screen. */
export function useUsageWindow(range: UsageRange): UsageView {
  // The windows change only with the range or the day, so charts built from them aren't rebuilt on every render.
  const today = localDayKey(new Date());
  const { period, before } = useMemo(() => {
    const now = new Date();
    return { period: windowFor(range, now), before: previousWindow(range, now) };
  }, [range, today]);
  const current = useQuery({ ...summaryOptions({ since: period.since, until: period.until, bucket: period.bucket }), placeholderData: keepPreviousData });
  const previous = useQuery({ ...summaryOptions({ since: before?.since, until: before?.until }), enabled: before !== null });
  return {
    period,
    summary: current.data,
    previous: before ? previous.data : null,
    isLoading: current.isLoading,
    error: current.error,
  };
}

/** Every model and provider ever used (the Prices tab lists them). */
export const useUsedModels = () => useQuery(summaryOptions({})).data?.by_provider_model ?? [];
