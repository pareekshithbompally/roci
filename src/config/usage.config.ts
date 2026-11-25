/** Usage (Settings › Usage): its periods, what its charts split by, use-case names and copy. */

import type { UsageCategory } from '@extensions/usage';

/** The span Usage shows: a calendar week or month (stepped back and forward), or everything. */
export type UsagePeriod = 'week' | 'month' | 'all';
/** What a chart measures: money, or how many requests. */
export type UsageMeasure = 'cost' | 'requests';
/** What the lead chart stacks and Most Used lists: models, or use cases (Screen Time's apps and categories). */
export type UsageSplitBy = 'model' | 'useCase';
/** Which prices the Prices table shows. */
export type PriceScope = 'all' | 'unknown' | 'own';

export const USAGE_CONFIG = {
  periods: [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'all', label: 'All' },
  ] as const satisfies ReadonlyArray<{ value: UsagePeriod; label: string }>,
  defaultPeriod: 'week' as UsagePeriod,
  /** Parts the lead chart colours (the largest); the rest are drawn together as Other. */
  coloredParts: 5,
  /** Most Used rows before Show More. */
  mostUsedRows: 5,
  /** What each recorded use case is called; one the app doesn't name shows under its own name. */
  useCases: {
    chat: 'Chat',
    image: 'Images',
    summary: 'Summaries',
    transcription: 'Transcription',
    readAloud: 'Read aloud',
  } as const satisfies Record<UsageCategory, string>,
  copy: {
    empty: 'No usage yet. Start a chat or transcribe a recording to see it here.',
    emptyPeriod: 'No usage in this period.',
    loadFailed: 'Couldn’t load usage',
    periodLabel: 'Period',
    /** The stepper under the period: this one, the one before, or its dates. */
    step: {
      current: { week: 'This Week', month: 'This Month' },
      last: { week: 'Last Week', month: 'Last Month' },
      earlier: 'Earlier',
      later: 'Later',
    },
    allTime: 'All Time',
    cost: 'Cost',
    requests: 'Requests',
    tokens: 'Tokens',
    /** The lead figure: per day over a week or month, per month over all time. */
    average: { day: 'Daily Average', month: 'Monthly Average' },
    total: { cost: 'Total Cost', requests: 'Total Requests', tokens: 'Total Tokens' },
    /** Against the period before ("12% less than the week before"). */
    change: (share: string, more: boolean, period: 'week' | 'month') => `${share} ${more ? 'more' : 'less'} than the ${period} before`,
    busiest: { day: 'Busiest Day', month: 'Busiest Month' },
    /** A cost that can't be worked out: a paid model with no known price (never shown as free). */
    noPrice: 'no price',
    /** Under the cost when some calls ran on cloud models with no known price (left out of the total). */
    unpriced: (calls: number) => `${calls} ${calls === 1 ? 'call has' : 'calls have'} no price`,
    tokensIn: (n: string) => `${n} in`,
    tokensOut: (n: string) => `${n} out`,
    cached: (share: string) => `${share} cached`,
    other: 'Other',
    /** A picked day (a tap on its bar) back to the whole period. */
    wholePeriod: 'Show All',
    mostUsed: 'Most Used',
    show: { model: 'Show Use Cases', useCase: 'Show Models' } as const satisfies Record<UsageSplitBy, string>,
    showMore: 'Show More',
    showLess: 'Show Less',
    /** A model's or use case's own page. */
    detail: {
      usedFor: 'Used For',
      models: 'Models',
      info: 'Info',
      provider: 'Provider',
      audio: 'Audio',
      perRequest: 'Cost per Request',
      price: 'Price',
    },
    /** After a server you run, so it isn't mistaken for the same maker's cloud ("Ollama (local)"). */
    yourServer: (title: string) => `${title} (local)`,
    /** The rows at the foot that open their own pages. */
    pages: { tools: 'Tools the AI Used', prices: 'Prices' },
    noPriceCount: (count: number) => (count > 0 ? `${count} without a price` : ''),
    calls: (n: string, count: number) => `${n} ${count === 1 ? 'call' : 'calls'}`,
    columns: { tool: 'Tool', calls: 'Calls', failed: 'Failed', time: 'Avg time', lastUsed: 'Last used' },
    toolsLabel: 'Tools the AI used',
    noTools: 'No tool calls in this period.',
    noMatches: 'Nothing matches.',
    search: { tools: 'Search tools', prices: 'Search models or providers' },
    prices: {
      label: 'Model prices',
      model: 'Model',
      input: 'Input $ / 1M',
      output: 'Output $ / 1M',
      perMinute: 'Audio $ / min',
      footer: 'Prices per million tokens, and per minute of audio for speech billed by the minute. A price you set is used instead of models.dev’s and also prices that model’s earlier calls.',
      none: 'No paid models yet. Models you use and add show here.',
      sources: { own: 'You', catalog: 'models.dev', free: 'Free', unknown: 'No price' },
      rates: (input: string, output: string) => `${input} / ${output}`,
      reset: 'Use models.dev Price',
      edit: 'Edit…',
      group: 'Price',
      scopeLabel: 'Show',
      scopes: [
        { value: 'all', label: 'All' },
        { value: 'unknown', label: 'No price' },
        { value: 'own', label: 'Yours' },
      ] as const satisfies ReadonlyArray<{ value: PriceScope; label: string }>,
    },
  },
} as const;
