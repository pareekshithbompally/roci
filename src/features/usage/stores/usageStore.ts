/** Usage view state: the open tab and the time range every Activity chart shares. */

import { create } from 'zustand';
import { USAGE_CONFIG, type UsageRange, type UsageTab } from '@config/usage.config';

interface UsageState {
  tab: UsageTab;
  range: UsageRange;
  setTab: (tab: UsageTab) => void;
  setRange: (range: UsageRange) => void;
}

export const useUsageStore = create<UsageState>((set) => ({
  tab: 'activity',
  range: USAGE_CONFIG.defaultRange,
  setTab: (tab) => set({ tab }),
  setRange: (range) => set({ range }),
}));

export const useUsageTab = () => useUsageStore((s) => s.tab);
export const useSetUsageTab = () => useUsageStore((s) => s.setTab);
export const useUsageRange = () => useUsageStore((s) => s.range);
export const useSetUsageRange = () => useUsageStore((s) => s.setRange);
