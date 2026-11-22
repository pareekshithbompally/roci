/** Charts, figures and tables the model shows with `show`: how much one may hold, and their words. Their look is the kit's
 *  (`Chart`, `StatCard`, `DataTable`), so sizes and colours come from `UI_CONFIG` and the tokens. */

import { UI_CONFIG } from '@config/ui.config';

export const RESULT_VIEWS_CONFIG = {
  /** One series per colour slot (`--viz-1` …); past them a mark would go neutral. */
  maxSeries: UI_CONFIG.chart.seriesSlots,
  /** A year of days. */
  maxPoints: 366,
  maxStats: 4,
  maxColumns: 8,
  maxRows: 200,
  chartHeight: UI_CONFIG.chart.trendHeight,
} as const;

export const RESULT_VIEWS_COPY = {
  source: (name: string) => `Source: ${name}`,
  asOf: (when: string) => `As of ${when}`,
  emptyTable: 'No rows',
} as const;
