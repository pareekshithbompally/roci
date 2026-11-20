/** Usage › Activity, top down, one page with nothing to drill into:
 *  0 the range · 1 how much (KPIs) · 2 when (cost over requests, one timeline) · 3 where it went (by model, provider, use case)
 *  · 4 what exactly (models, tools the AI used, each day). */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, NotebookPen, Sparkles, type LucideIcon } from 'lucide-react';
import {
  Callout, Chart, DataTable, DonutChart, Icon, Section, StatCard, Tabs, Text,
  type ChartOption, type DataColumn, type DonutSlice,
} from '@shared/ui';
import { JOB_GLYPH, LoadingPane, ModelIcon } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';
import { USAGE_CONFIG, type UsageMeasure } from '@config/usage.config';
import type { ProviderModelBreakdown, ToolBreakdown, UsageBucket, UsageSummary } from '@extensions/usage';
import { errorMessage } from '@shared/utils/errors';
import { formatRelativeTime } from '@shared/utils/formatters';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { formatToolName, toolCallIcon } from '@features/chat';
import { bucketKeys, type UsageWindow } from '@features/usage/model/period';
import { fillSeries, measureOf, modelName, splitView, type SplitEntry, type SplitMark, type UsageSplit } from '@features/usage/model/series';
import { bucketLabel, formatMeasure, formatMs, formatTick, formatTokens } from '@features/usage/model/format';
import { useUsageWindow } from '@features/usage/hooks/useUsageQueries';
import { useSetUsageRange, useUsageRange } from '@features/usage/stores/usageStore';

const COPY = USAGE_CONFIG.copy;
const COL = COPY.columns;
const C = UI_CONFIG.chart;
const PERCENT = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const SHARE = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });
const MEASURE_LABEL = Object.fromEntries(USAGE_CONFIG.measures.map((m) => [m.value, m.label])) as Record<UsageMeasure, string>;

/** Each use case's glyph (as in Default Models); one the app doesn't name gets a generic one. */
const USE_CASE_GLYPH: Record<string, LucideIcon> = {
  chat: JOB_GLYPH.chat,
  'chat-extras': Lightbulb,
  summary: JOB_GLYPH.summaries,
  liveNotes: NotebookPen,
  transcription: JOB_GLYPH.transcription,
};

/** A cost as it reads: dollars, or "No price" when calls had none and nothing else priced it. */
const costText = (cost: number, unpriced: number): string => (cost === 0 && unpriced > 0 ? COPY.prices.sources.unknown : formatMeasure('cost', cost));

// ── 1 · How much ──

/** "+18% vs previous 30 days"; "New" when there was nothing before; none for all time or while the window before loads. */
function changeLine(current: number, previous: number | undefined, rangeLabel: string): string | undefined {
  if (previous === undefined) return undefined;
  if (previous === 0) return current === 0 ? undefined : `New vs previous ${rangeLabel}`;
  return `${PERCENT.format((current - previous) / previous)} vs previous ${rangeLabel}`;
}

const Kpis: React.FC<{ summary: UsageSummary; previous: UsageSummary | undefined; rangeLabel: string }> = ({ summary, previous, rangeLabel }) => {
  const K = COPY.kpis;
  const input = summary.total_input_tokens;
  const cached = input > 0 ? `${SHARE.format(summary.total_cache_read_tokens / input)} cached` : null;
  const tokensDetail = [`${formatTokens(input)} in`, `${formatTokens(summary.total_output_tokens)} out`, cached].filter(Boolean).join(' · ');
  const perRequest = summary.total_calls > 0 ? summary.total_cost / summary.total_calls : 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={K.cost}
        value={formatMeasure('cost', summary.total_cost)}
        detail={summary.unpriced_calls > 0 ? COPY.unpriced(summary.unpriced_calls) : changeLine(summary.total_cost, previous?.total_cost, rangeLabel)}
      />
      <StatCard label={K.requests} value={formatMeasure('requests', summary.total_calls)} detail={changeLine(summary.total_calls, previous?.total_calls, rangeLabel)} />
      <StatCard label={K.tokens} value={formatTokens(input + summary.total_output_tokens)} detail={tokensDetail} />
      <StatCard label={K.perRequest} value={formatMeasure('cost', perRequest)} detail={K.average} />
    </div>
  );
};

// ── 2 · When ──

const TREND_MEASURES: readonly UsageMeasure[] = ['cost', 'requests'];

/** Cost above requests, one plot each on one timeline: each keeps its own true scale, one tooltip reads both for the day. */
const Trend: React.FC<{ series: UsageBucket[]; period: UsageWindow }> = ({ series, period }) => {
  const option = useMemo<ChartOption>(() => {
    const dates = series.map((b) => bucketLabel(b.key, period.bucket, 'short'));
    const last = TREND_MEASURES.length - 1;
    return {
      grid: TREND_MEASURES.map((_, i) => ({ left: C.inset, right: C.inset, top: C.inset + i * (C.trendPlot + C.trendGap), height: C.trendPlot, containLabel: true })),
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const i = (Array.isArray(params) ? params[0] : params).dataIndex;
          const lines = TREND_MEASURES.map((m) => `${MEASURE_LABEL[m]} <b>${formatMeasure(m, measureOf(m, series[i]))}</b>`);
          return [bucketLabel(series[i].key, period.bucket, 'long'), ...lines].join('<br/>');
        },
      },
      xAxis: TREND_MEASURES.map((_, i) => ({ type: 'category' as const, gridIndex: i, data: dates, axisLabel: { show: i === last } })),
      yAxis: TREND_MEASURES.map((m, i) => ({
        type: 'value' as const, gridIndex: i, name: MEASURE_LABEL[m], splitNumber: 2, axisLabel: { formatter: (v: number) => formatTick(m, v) },
      })),
      series: TREND_MEASURES.map((m, i) => ({
        type: 'bar' as const, name: MEASURE_LABEL[m], xAxisIndex: i, yAxisIndex: i, data: series.map((b) => measureOf(m, b)),
      })),
    };
  }, [series, period.bucket]);
  return (
    <Section title={COPY.trend}>
      <div className="py-2">
        <Chart option={option} height={C.inset + 2 * C.trendPlot + C.trendGap + C.trendAxis} label={COPY.trend} />
      </div>
    </Section>
  );
};

// ── 3 · Where it went ──

/** A slice's icon: the model's, the provider's, or the use case's. */
function markIcon(mark: SplitMark | null): React.ReactNode {
  if (!mark) return null;
  if (mark.kind === 'useCase') return <Icon icon={USE_CASE_GLYPH[mark.category] ?? Sparkles} size="sm" />;
  return <ModelIcon provider={mark.provider} modelId={mark.kind === 'model' ? mark.model : undefined} size={C.legendIcon} />;
}

const toSlice = (measure: UsageMeasure) => (e: SplitEntry): DonutSlice => ({
  key: e.key,
  label: e.name,
  leading: markIcon(e.mark),
  value: measureOf(measure, e),
  valueText: measure === 'cost' ? costText(e.estimated_cost, e.unpriced) : formatMeasure('requests', e.calls),
});

const SplitDonut: React.FC<{ summary: UsageSummary; split: UsageSplit }> = ({ summary, split }) => {
  const [measure, setMeasure] = useState<UsageMeasure>('cost');
  const { slices, note } = useMemo(() => {
    const view = splitView(summary, split, measure);
    return {
      slices: view.slices.map(toSlice(measure)),
      note: view.free ? { key: 'free', label: COPY.freeNote(view.free.count, split, view.free.calls), value: 0, valueText: COPY.free } : undefined,
    };
  }, [summary, split, measure]);
  return (
    <Section title={COPY.splits[split]} accessory={<Tabs items={USAGE_CONFIG.measures} value={measure} onValueChange={setMeasure} label="Measure" />}>
      <div className="py-3">
        <DonutChart slices={slices} note={note} label={`${MEASURE_LABEL[measure]} ${COPY.splits[split].toLowerCase()}`} />
      </div>
    </Section>
  );
};

// ── 4 · What exactly ──

const figure = (text: string) => <Text variant="figure">{text}</Text>;

const MODEL_COLUMNS: ReadonlyArray<DataColumn<ProviderModelBreakdown>> = [
  {
    key: 'model',
    header: COL.model,
    cell: (m) => (
      <div className="flex min-w-0 items-center gap-2">
        <ModelIcon provider={m.provider} modelId={m.model} size={C.legendIcon} />
        <div className="flex min-w-0 flex-col">
          <Text truncate>{modelName(m.model)}</Text>
          <Text variant="caption" tone="muted" truncate>{getProviderTitle(m.provider)}</Text>
        </div>
      </div>
    ),
  },
  { key: 'requests', header: COL.requests, align: 'end', cell: (m) => figure(formatMeasure('requests', m.calls)) },
  { key: 'input', header: COL.input, align: 'end', cell: (m) => figure(formatTokens(m.input_tokens)) },
  { key: 'cached', header: COL.cached, align: 'end', cell: (m) => figure(formatTokens(m.cache_read_tokens)) },
  { key: 'output', header: COL.output, align: 'end', cell: (m) => figure(formatTokens(m.output_tokens)) },
  { key: 'cost', header: COL.cost, align: 'end', cell: (m) => figure(costText(m.estimated_cost, m.unpriced_calls)) },
  { key: 'per', header: COL.perRequest, align: 'end', cell: (m) => figure(costText(m.calls > 0 ? m.estimated_cost / m.calls : 0, m.unpriced_calls)) },
];

const TOOL_COLUMNS: ReadonlyArray<DataColumn<ToolBreakdown>> = [
  {
    key: 'tool',
    header: COL.tool,
    cell: (t) => (
      <div className="flex min-w-0 items-center gap-2">
        <Icon icon={toolCallIcon(t.tool)} size="sm" />
        <Text truncate>{formatToolName(t.tool)}</Text>
      </div>
    ),
  },
  { key: 'calls', header: COL.calls, align: 'end', cell: (t) => figure(formatMeasure('requests', t.calls)) },
  { key: 'failed', header: COL.failed, align: 'end', cell: (t) => figure(formatMeasure('requests', t.failed)) },
  { key: 'time', header: COL.time, align: 'end', cell: (t) => figure(t.avg_ms === null ? '—' : formatMs(t.avg_ms)) },
  { key: 'last', header: COL.lastUsed, align: 'end', cell: (t) => <Text tone="muted">{formatRelativeTime(t.last_used)}</Text> },
];

const dayColumns = (period: UsageWindow): ReadonlyArray<DataColumn<UsageBucket>> => [
  { key: 'date', header: COL.date, cell: (b) => <Text>{bucketLabel(b.key, period.bucket, 'long')}</Text> },
  { key: 'requests', header: COL.requests, align: 'end', cell: (b) => figure(formatMeasure('requests', b.calls)) },
  { key: 'input', header: COL.input, align: 'end', cell: (b) => figure(formatTokens(b.input_tokens)) },
  { key: 'cached', header: COL.cached, align: 'end', cell: (b) => figure(formatTokens(b.cache_read_tokens)) },
  { key: 'output', header: COL.output, align: 'end', cell: (b) => figure(formatTokens(b.output_tokens)) },
  { key: 'cost', header: COL.cost, align: 'end', cell: (b) => figure(formatMeasure('cost', b.estimated_cost)) },
];

const Tables: React.FC<{ summary: UsageSummary; series: UsageBucket[]; period: UsageWindow }> = ({ summary, series, period }) => {
  const T = COPY.tables;
  const days = useMemo(() => series.filter((b) => b.calls > 0).reverse(), [series]);
  return (
    <>
      <Section title={T.models} layout="stack">
        <DataTable columns={MODEL_COLUMNS} rows={summary.by_provider_model} rowKey={(m) => `${m.provider}/${m.model}`} label={T.models} />
      </Section>
      <Section title={T.tools} layout="stack">
        {summary.by_tool.length > 0
          ? <DataTable columns={TOOL_COLUMNS} rows={summary.by_tool} rowKey={(t) => t.tool} label={T.tools} />
          : <Text as="p" tone="muted" className="mx-4">{COPY.noTools}</Text>}
      </Section>
      <Section title={T.days} layout="stack">
        <DataTable columns={dayColumns(period)} rows={days} rowKey={(b) => b.key} label={T.days} />
      </Section>
    </>
  );
};

// ── The page ──

const Story: React.FC<{ summary: UsageSummary; previous: UsageSummary | undefined; period: UsageWindow; rangeLabel: string }> = ({ summary, previous, period, rangeLabel }) => {
  const series = useMemo(() => fillSeries(bucketKeys(period, summary.first_timestamp, new Date()), summary.trend), [period, summary]);
  return (
    <>
      <Kpis summary={summary} previous={previous} rangeLabel={rangeLabel} />
      <Trend series={series} period={period} />
      <div className="grid gap-4 lg:grid-cols-3">
        <SplitDonut summary={summary} split="model" />
        <SplitDonut summary={summary} split="provider" />
        <SplitDonut summary={summary} split="useCase" />
      </div>
      <Tables summary={summary} series={series} period={period} />
    </>
  );
};

export const ActivityTab: React.FC = () => {
  const range = useUsageRange();
  const setRange = useSetUsageRange();
  const { period, summary, previous, isLoading, error } = useUsageWindow(range);
  const rangeLabel = (USAGE_CONFIG.ranges.find((r) => r.value === range)?.label ?? '').toLowerCase();

  const body = () => {
    if (isLoading) return <LoadingPane />;
    if (error) {
      return (
        <Callout variant="warning" icon={<Icon icon={AlertTriangle} size="sm" />}>
          <Text as="p" tone="inherit">{COPY.loadFailed}</Text>
          <Text as="p" variant="helper" tone="muted" className="mt-0.5">{errorMessage(error)}</Text>
        </Callout>
      );
    }
    if (!summary || summary.total_calls === 0) return <Text as="p" tone="muted" className="py-12 text-center">{range === 'all' ? COPY.empty : COPY.emptyPeriod}</Text>;
    return <Story summary={summary} previous={previous ?? undefined} period={period} rangeLabel={rangeLabel} />;
  };

  return (
    <>
      <Tabs items={USAGE_CONFIG.ranges} value={range} onValueChange={setRange} label="Range" />
      {body()}
    </>
  );
};
