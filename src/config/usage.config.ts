/** Usage (Settings › Usage): time ranges, chart metrics and copy; the one source for every usage screen. */

export type UsageRange = '7d' | '30d' | 'all';
export type UsageMetric = 'cost' | 'requests' | 'tokens';

export const USAGE_CONFIG = {
  ranges: [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: 'all', label: 'All time' },
  ] as const satisfies ReadonlyArray<{ value: UsageRange; label: string }>,
  /** Days in each fixed range, counted back from today inclusive (local calendar days). */
  rangeDays: { '7d': 7, '30d': 30 } as const satisfies Record<Exclude<UsageRange, 'all'>, number>,
  defaultRange: '30d' as UsageRange,
  metrics: [
    { value: 'cost', label: 'Cost' },
    { value: 'requests', label: 'Requests' },
    { value: 'tokens', label: 'Tokens' },
  ] as const satisfies ReadonlyArray<{ value: UsageMetric; label: string }>,
  defaultMetric: 'cost' as UsageMetric,
  copy: {
    title: 'Usage',
    empty: 'No usage yet. Start a chat or transcribe a recording to see it here.',
    emptyPeriod: 'No usage in this period.',
    loadFailed: 'Couldn’t load usage',
    allTitle: 'All usage',
    sections: {
      overview: 'Overview',
      highlights: 'Highlights',
      totals: 'Totals',
      byProvider: 'By provider',
      byModel: 'By model',
      byFeature: 'By feature',
      history: 'History',
    },
  },
} as const;
