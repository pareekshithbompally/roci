/** Usage view state: one range and metric for every usage screen, and the in-panel drill path (Mac, iPad). */

import { create } from 'zustand';
import { USAGE_CONFIG, type UsageMetric, type UsageRange } from '@config/usage.config';
import type { UsageSubject } from '@features/usage/model/subject';

interface UsageState {
  range: UsageRange;
  metric: UsageMetric;
  /** Pages drilled into inside the Settings panel, deepest last; a phone pushes screens instead. */
  path: UsageSubject[];
  setRange: (range: UsageRange) => void;
  setMetric: (metric: UsageMetric) => void;
  open: (subject: UsageSubject) => void;
  back: () => void;
  reset: () => void;
}

export const useUsageStore = create<UsageState>((set) => ({
  range: USAGE_CONFIG.defaultRange,
  metric: USAGE_CONFIG.defaultMetric,
  path: [],
  setRange: (range) => set({ range }),
  setMetric: (metric) => set({ metric }),
  open: (subject) => set((s) => ({ path: [...s.path, subject] })),
  back: () => set((s) => ({ path: s.path.slice(0, -1) })),
  reset: () => set({ path: [] }),
}));

export const useUsageRange = () => useUsageStore((s) => s.range);
export const useUsageMetric = () => useUsageStore((s) => s.metric);
export const useUsagePath = () => useUsageStore((s) => s.path);
export const useSetUsageRange = () => useUsageStore((s) => s.setRange);
export const useSetUsageMetric = () => useUsageStore((s) => s.setMetric);
export const useOpenUsageInPanel = () => useUsageStore((s) => s.open);
export const useUsageBack = () => useUsageStore((s) => s.back);
export const useResetUsagePath = () => useUsageStore((s) => s.reset);
