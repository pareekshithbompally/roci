/**
 * useUsageData Hook
 *
 * Aggregated usage summary from the store plugin, keyed by time range.
 * Query owns the fetch + cache; switching ranges hits cache when fresh.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUsageSummary } from '@extensions/usage';
import type { UsageSummary } from '@extensions/usage';

export type TimeRange = '7d' | '30d' | 'all';

const RANGE_MS: Record<TimeRange, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': 0,
};

export interface UseUsageDataReturn {
  summary: UsageSummary | null;
  isLoading: boolean;
  error: string | null;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  refresh: () => void;
}

export function useUsageData(): UseUsageDataReturn {
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const { data, isLoading, error } = useQuery({
    queryKey: ['usage', timeRange],
    queryFn: async () => {
      const since = timeRange === 'all' ? undefined : Date.now() - RANGE_MS[timeRange];
      return getUsageSummary(since);
    },
  });

  return {
    summary: data ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    timeRange,
    setTimeRange,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ['usage', timeRange] }).catch((err: unknown) =>
        console.error('[useUsageData] Failed to refresh usage:', err)
      );
    },
  };
}
