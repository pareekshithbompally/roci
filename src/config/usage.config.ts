/** Usage (Settings › Usage): its two tabs, time ranges, the measures charts switch between, use-case names and copy. */

import type { UsageCategory } from '@extensions/usage';

export type UsageRange = '7d' | '30d' | 'all';
export type UsageTab = 'activity' | 'prices';
/** What a chart measures: money, or how many requests. */
export type UsageMeasure = 'cost' | 'requests';
/** Which prices the Prices table shows. */
export type PriceScope = 'all' | 'unknown' | 'own';

export const USAGE_CONFIG = {
  tabs: [
    { value: 'activity', label: 'Activity' },
    { value: 'prices', label: 'Prices' },
  ] as const satisfies ReadonlyArray<{ value: UsageTab; label: string }>,
  /** `period` names the window in a sentence ("Last 30 days · $0.11 · 179 requests"). */
  ranges: [
    { value: '7d', label: '7 days', period: 'Last 7 days' },
    { value: '30d', label: '30 days', period: 'Last 30 days' },
    { value: 'all', label: 'All time', period: 'All time' },
  ] as const satisfies ReadonlyArray<{ value: UsageRange; label: string; period: string }>,
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
    image: 'Images',
    summary: 'Summaries',
    liveNotes: 'Live notes',
    transcription: 'Transcription',
    readAloud: 'Read aloud',
  } as const satisfies Record<UsageCategory, string>,
  /** Use cases recorded under names from before titles and follow-ups became one call: counted as that call. */
  useCaseAliases: { suggestions: 'chat-extras', 'title-gen': 'chat-extras' } as const satisfies Record<string, UsageCategory>,
  copy: {
    empty: 'No usage yet. Start a chat or transcribe a recording to see it here.',
    emptyPeriod: 'No usage in this period.',
    loadFailed: 'Couldn’t load usage',
    /** A cost that can't be worked out: a paid model with no known price (never shown as free). */
    noPrice: 'no price',
    /** Under the cost when some calls ran on cloud models with no known price (left out of the total). */
    unpriced: (calls: number) => `${calls} ${calls === 1 ? 'call has' : 'calls have'} no price`,
    /** After a server you run, so it isn't mistaken for the same maker's cloud ("Ollama (local)"). */
    yourServer: (title: string) => `${title} (local)`,
    splits: { model: 'By model', provider: 'By provider', useCase: 'By use case' },
    kpis: { cost: 'Cost', requests: 'Requests', tokens: 'Tokens', perRequest: 'Cost per request', average: 'Average' },
    trend: 'Over time',
    columns: {
      date: 'Date', model: 'Model', tool: 'Tool', requests: 'Requests', calls: 'Calls', failed: 'Failed', time: 'Avg time',
      lastUsed: 'Last used', input: 'Input', cached: 'Cached', output: 'Output', audio: 'Audio', cost: 'Cost',
      perRequest: 'Per request',
    },
    tables: { models: 'Models', tools: 'Tools the AI used', days: 'By day' },
    noTools: 'No tool calls in this period.',
    noMatches: 'Nothing matches.',
    search: { models: 'Search models or providers', tools: 'Search tools', prices: 'Search models or providers' },
    prices: {
      label: 'Model prices',
      model: 'Model',
      input: 'Input $ / 1M',
      output: 'Output $ / 1M',
      perMinute: 'Audio $ / min',
      footer: 'Prices per million tokens, and per minute of audio for speech billed by the minute. Type a price to use yours instead of models.dev’s; it also prices that model’s earlier calls. Clear every rate to go back.',
      none: 'No paid models yet. Models you use and add show here.',
      sources: { own: 'You', catalog: 'models.dev', free: 'Free', unknown: 'No price' },
      scopeLabel: 'Show',
      scopes: [
        { value: 'all', label: 'All' },
        { value: 'unknown', label: 'No price' },
        { value: 'own', label: 'Yours' },
      ] as const satisfies ReadonlyArray<{ value: PriceScope; label: string }>,
    },
  },
} as const;
