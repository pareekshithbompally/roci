/** Usage (Settings › Usage): its two tabs, time ranges, the measures charts switch between, use-case names and copy. */

import type { UsageCategory } from '@extensions/usage';

export type UsageRange = '7d' | '30d' | 'all';
export type UsageTab = 'activity' | 'prices';
/** What a chart measures: money, or how many requests. */
export type UsageMeasure = 'cost' | 'requests';

export const USAGE_CONFIG = {
  tabs: [
    { value: 'activity', label: 'Activity' },
    { value: 'prices', label: 'Prices' },
  ] as const satisfies ReadonlyArray<{ value: UsageTab; label: string }>,
  ranges: [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: 'all', label: 'All time' },
  ] as const satisfies ReadonlyArray<{ value: UsageRange; label: string }>,
  /** Days in each fixed range, counted back from today inclusive (local calendar days). */
  rangeDays: { '7d': 7, '30d': 30 } as const satisfies Record<Exclude<UsageRange, 'all'>, number>,
  defaultRange: '30d' as UsageRange,
  measures: [
    { value: 'cost', label: 'Cost' },
    { value: 'requests', label: 'Requests' },
  ] as const satisfies ReadonlyArray<{ value: UsageMeasure; label: string }>,
  /** What each recorded use case is called; one the app doesn't name shows under its own name. */
  useCases: {
    chat: 'Chat',
    'chat-extras': 'Titles & follow-ups',
    summary: 'Summaries',
    liveNotes: 'Live notes',
    transcription: 'Transcription',
  } as const satisfies Record<UsageCategory, string>,
  copy: {
    title: 'Usage',
    empty: 'No usage yet. Start a chat or transcribe a recording to see it here.',
    emptyPeriod: 'No usage in this period.',
    loadFailed: 'Couldn’t load usage',
    /** A cost that can't be worked out: a paid model with no known price (never shown as free). */
    noPrice: 'no price',
    /** Under the cost when some calls ran on cloud models with no known price (left out of the total). */
    unpriced: (calls: number) => `${calls} ${calls === 1 ? 'call has' : 'calls have'} no price — set it in Prices`,
    /** The donut a measure has nothing in (models that run free have no cost). */
    nothing: (measure: string) => `No ${measure.toLowerCase()} in this period.`,
    other: 'Other',
    splits: { model: 'By model', provider: 'By provider', useCase: 'By use case' },
    trend: (measure: string) => `${measure} over time`,
    table: { label: 'Usage by day', date: 'Date', requests: 'Requests', input: 'Input tokens', output: 'Output tokens', cost: 'Cost' },
    prices: {
      label: 'Model prices',
      model: 'Model',
      provider: 'Provider',
      source: 'Price from',
      input: 'Input $ / 1M',
      output: 'Output $ / 1M',
      footer: 'Prices per million tokens. Type a price to use yours instead of models.dev’s; it also prices that model’s earlier calls. Clear both to go back.',
      none: 'No paid models yet. Models you use and add show here.',
      sources: { own: 'You', catalog: 'models.dev', free: 'Free on this device', unknown: 'No price' },
    },
  },
} as const;
