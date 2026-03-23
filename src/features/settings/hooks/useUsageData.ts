/**
 * useUsageData Hook
 *
 * Fetches aggregated usage summary from the vectordb plugin.
 * Supports time range filtering (7d, 30d, all time).
 */

import { useState, useEffect, useCallback } from 'react';
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
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  refresh: () => void;
}

export function useUsageData(): UseUsageDataReturn {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const fetchData = useCallback(async (range: TimeRange) => {
    setIsLoading(true);
    try {
      const since = range === 'all' ? undefined : Date.now() - RANGE_MS[range];
      const data = await getUsageSummary(since);
      setSummary(data);
    } catch (error) {
      console.error('[useUsageData] Failed to fetch usage summary:', error);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(timeRange);
  }, [timeRange, fetchData]);

  const refresh = useCallback(() => {
    fetchData(timeRange);
  }, [timeRange, fetchData]);

  return { summary, isLoading, timeRange, setTimeRange, refresh };
}
