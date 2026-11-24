/** Usage view state: the period on screen (a week or month, how many back), and what its lead chart and Most Used split by. */

import { create } from 'zustand';
import { USAGE_CONFIG, type UsagePeriod, type UsageSplitBy } from '@config/usage.config';

interface UsageState {
  period: UsagePeriod;
  /** Steps back from the period holding today (0); a new period starts at today's. */
  offset: number;
  splitBy: UsageSplitBy;
  setPeriod: (period: UsagePeriod) => void;
  step: (by: 1 | -1) => void;
  toggleSplit: () => void;
}

const useUsageStore = create<UsageState>((set) => ({
  period: USAGE_CONFIG.defaultPeriod,
  offset: 0,
  splitBy: 'model',
  setPeriod: (period) => set({ period, offset: 0 }),
  // Never past the period holding today.
  step: (by) => set((s) => ({ offset: Math.max(0, s.offset - by) })),
  toggleSplit: () => set((s) => ({ splitBy: s.splitBy === 'model' ? 'useCase' : 'model' })),
}));

export const useUsagePeriod = () => useUsageStore((s) => s.period);
export const useUsageOffset = () => useUsageStore((s) => s.offset);
export const useUsageSplitBy = () => useUsageStore((s) => s.splitBy);
export const useSetUsagePeriod = () => useUsageStore((s) => s.setPeriod);
export const useStepUsage = () => useUsageStore((s) => s.step);
export const useToggleUsageSplit = () => useUsageStore((s) => s.toggleSplit);
/** The period now, outside React (preloading). */
export const usagePeriodNow = () => useUsageStore.getState().period;
