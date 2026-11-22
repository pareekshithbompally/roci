/** What the model sends `show` (one flat object, so every provider's tool calling reads it), and the typed view the chat
 *  draws from it. Flat fields are checked per kind here, so a malformed call comes back as an error the model can fix. */

import { z } from 'zod';
import { RESULT_VIEWS_CONFIG as LIMITS } from '@config/resultViews.config';

export const RESULT_VIEW_KINDS = ['chart', 'stats', 'table'] as const;
export const CHART_TYPES = ['line', 'area', 'bar'] as const;

const words = (description: string) => z.string().trim().min(1).describe(description);

const series = z.object({
  name: words('What this line or set of bars stands for, e.g. "NVDA".'),
  values: z.array(z.number()).describe('One number per label, in the same order.'),
});

const stat = z.object({
  label: words('What the figure is, e.g. "NVDA YTD".'),
  value: words('The figure as it should read, with its unit, e.g. "-32.5%" or "$125.53".'),
  change: z.string().trim().optional().describe('Its change, signed, e.g. "+1.2% today".'),
});

export const showInput = z
  .object({
    kind: z.enum(RESULT_VIEW_KINDS).describe('chart: values over time or across categories. stats: one to a few headline figures. table: rows and columns.'),
    title: words('A short title naming what is shown.'),
    source: words('Where the figures came from: the website, app or meeting they were found in.'),
    source_url: z.url().optional().describe('The page the figures came from, when there is one.'),
    chart_type: z.enum(CHART_TYPES).default('line').describe('chart: line for a trend, area for a trend of one total, bar to compare categories.'),
    labels: z.array(z.string().trim()).max(LIMITS.maxPoints).optional().describe('chart: the x-axis labels (dates or categories), in order.'),
    series: z.array(series).max(LIMITS.maxSeries).optional().describe('chart: one or more series, each with a value per label.'),
    unit: z.string().trim().optional().describe('chart: the unit of the values, e.g. "%", "USD".'),
    stats: z.array(stat).max(LIMITS.maxStats).optional().describe('stats: the figures, side by side.'),
    as_of: z.string().trim().optional().describe('stats: when the figures were true, e.g. "Nov 20, 2026".'),
    columns: z.array(z.string().trim()).max(LIMITS.maxColumns).optional().describe('table: the column headers.'),
    rows: z.array(z.array(z.string())).max(LIMITS.maxRows).optional().describe('table: the rows, each a cell per column.'),
  })
  .superRefine((input, ctx) => {
    for (const problem of problemsOf(input)) ctx.addIssue({ code: 'custom', message: problem });
  });

export type ShowInput = z.output<typeof showInput>;

/** What a kind needs that the call left out or got wrong, in words the model can act on. */
function problemsOf(input: Pick<ShowInput, 'kind' | 'labels' | 'series' | 'stats' | 'columns' | 'rows'>): string[] {
  if (input.kind === 'chart') {
    const count = input.labels?.length ?? 0;
    if (count === 0 || !input.series?.length) return ['A chart needs `labels` and at least one entry in `series`.'];
    return input.series.filter((s) => s.values.length !== count).map((s) => `Series "${s.name}" has ${s.values.length} values for ${count} labels.`);
  }
  if (input.kind === 'stats') return input.stats?.length ? [] : ['Stats need at least one entry in `stats`.'];
  const width = input.columns?.length ?? 0;
  if (width === 0 || !input.rows?.length) return ['A table needs `columns` and at least one row in `rows`.'];
  return input.rows.flatMap((row, i) => (row.length === width ? [] : [`Row ${i + 1} has ${row.length} cells for ${width} columns.`]));
}

export interface ViewSource {
  name: string;
  url?: string;
}

/** A view the chat draws natively, after the call that made it. */
export type ResultView =
  | { kind: 'chart'; title: string; source: ViewSource; chartType: (typeof CHART_TYPES)[number]; labels: string[]; series: { name: string; values: number[] }[]; unit?: string }
  | { kind: 'stats'; title: string; source: ViewSource; stats: { label: string; value: string; change?: string }[]; asOf?: string }
  | { kind: 'table'; title: string; source: ViewSource; columns: string[]; rows: string[][] };

/** A checked call as the view it draws. */
export function toResultView(input: ShowInput): ResultView {
  const base = { title: input.title, source: { name: input.source, ...(input.source_url && { url: input.source_url }) } };
  if (input.kind === 'chart') {
    return { ...base, kind: 'chart', chartType: input.chart_type, labels: input.labels ?? [], series: input.series ?? [], ...(input.unit && { unit: input.unit }) };
  }
  if (input.kind === 'stats') return { ...base, kind: 'stats', stats: input.stats ?? [], ...(input.as_of && { asOf: input.as_of }) };
  return { ...base, kind: 'table', columns: input.columns ?? [], rows: input.rows ?? [] };
}
