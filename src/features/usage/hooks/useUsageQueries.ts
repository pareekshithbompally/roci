/** Usage from the store plugin: a period's window by day (or month), the period before it, and every model ever used. */

import { useMemo } from 'react';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { localDayKey } from '@shared/utils/localDate';
import { queryKeys } from '@shared/query/queryKeys';
import { getUsageSummary, type ProviderModelBreakdown, type UsageQuery, type UsageSummary } from '@extensions/usage';
import { queryClient } from '@shared/query/queryClient';
import { usagePeriodNow } from '@features/usage/stores/usageStore';
import { useSystemFormatStore } from '@shared/stores/systemFormatStore';
import type { UsagePeriod } from '@config/usage.config';
import { previousWindow, windowFor, type UsageWindow } from '@features/usage/model/period';

/** Usage changes only when a request is logged, which invalidates every usage query; until then a result stays current. */
const summaryOptions = (query: UsageQuery) =>
  queryOptions({ queryKey: queryKeys.usage(query), queryFn: () => getUsageSummary(query), staleTime: Infinity });

interface UsageView {
  period: UsageWindow;
  summary: UsageSummary | undefined;
  /** The period before, for the change against it; null for all time. */
  previous: UsageSummary | undefined | null;
  isLoading: boolean;
  error: unknown;
}

/** A period's usage, `offset` periods back; while another loads, the last one stays on screen. */
export function useUsageWindow(kind: UsagePeriod, offset: number): UsageView {
  // The windows change only with the period, the step or the day, so charts built from them aren't rebuilt on every render.
  const today = localDayKey(new Date());
  const firstWeekday = useSystemFormatStore((s) => s.firstWeekday);
  const { period, before } = useMemo(() => {
    const now = new Date();
    return { period: windowFor(kind, offset, now, firstWeekday), before: previousWindow(kind, offset, now, firstWeekday) };
  }, [kind, offset, firstWeekday, today]);
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

/** Every model and provider ever used (the Prices tab lists them), and whether that's still loading. */
export function useUsedModels() {
  const { data, isLoading } = useQuery(summaryOptions({}));
  return { used: data?.by_provider_model ?? NONE, isLoading };
}

const NONE: ProviderModelBreakdown[] = [];

/** Loads Usage ahead (Settings opened), so it lands with its data: the period shown, and every model for Prices. */
export function preloadUsage(): void {
  const window = windowFor(usagePeriodNow(), 0, new Date(), useSystemFormatStore.getState().firstWeekday);
  const failed = (error: unknown) => console.error('[Usage] Preload failed:', error);
  queryClient.prefetchQuery(summaryOptions({ since: window.since, until: window.until, bucket: window.bucket })).catch(failed);
  queryClient.prefetchQuery(summaryOptions({})).catch(failed);
}
