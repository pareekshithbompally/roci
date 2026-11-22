/** Usage › Activity, top down, one page with nothing to drill into:
 *  0 the range · 1 how much (KPIs) · 2 when (cost over requests, one timeline) · 3 where it went (by model, provider, use case)
 *  · 4 what exactly (models, tools the AI used, each day). */

import React, { useCallback, useMemo, useState } from 'react';
import { ChartPie, Lightbulb, NotebookPen, Sparkles, type LucideIcon } from 'lucide-react';
import {
  Chart, DataTable, DonutChart, Icon, Section, StatCard, Tabs, Text,
  type ChartOption, type DataColumn, type DonutSlice,
} from '@shared/ui';
import { JOB_GLYPH, ModelIcon, ScreenState } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';
import { USAGE_CONFIG, type UsageMeasure } from '@config/usage.config';
import type { ProviderModelBreakdown, ToolBreakdown, UsageBucket, UsageSummary } from '@extensions/usage';
import { formatDuration, formatRelativeTime } from '@shared/utils/formatters';
import { toolCallIcon } from '@features/chat';
import { bucketKeys, type UsageWindow } from '@features/usage/model/period';
import { fillSeries, measureOf, modelName, providerName, splitEntries, toolName, type SplitEntry, type SplitMark, type UsageSplit, type UsageTotals } from '@features/usage/model/series';
import { bucketLabel, formatMeasure, formatMs, formatTick, formatTokens } from '@features/usage/model/format';
import { useUsageWindow } from '@features/usage/hooks/useUsageQueries';
import { useSetUsageRange, useUsageRange } from '@features/usage/stores/usageStore';
import { ModelCell } from './ModelCell';

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
  image: JOB_GLYPH.images,
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
  if (previous === 0) return current === 0 ? undefined : COPY.changeNew(rangeLabel);
  return COPY.change(PERCENT.format((current - previous) / previous), rangeLabel);
}

const Kpis: React.FC<{ summary: UsageSummary; previous: UsageSummary | undefined; rangeLabel: string }> = ({ summary, previous, rangeLabel }) => {
  const K = COPY.kpis;
  const input = summary.total_input_tokens;
  const cached = input > 0 ? COPY.cached(SHARE.format(summary.total_cache_read_tokens / input)) : null;
  const tokensDetail = [COPY.tokensIn(formatTokens(input)), COPY.tokensOut(formatTokens(summary.total_output_tokens)), cached].filter(Boolean).join(' · ');
  const perRequest = summary.total_calls > 0 ? summary.total_cost / summary.total_calls : 0;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

/** "Wed 19 Nov · $0.04 · 52 requests": a span (or a day) and its figures. */
const peekLine = (when: string, totals: UsageTotals) =>
  [when, formatMeasure('cost', totals.estimated_cost), COPY.requests(formatMeasure('requests', totals.calls), totals.calls)].join(' · ');

/** One measure over time, cost or requests. The line above reads the period's total, or the day under the pointer, with both
 *  figures — the chart's only words besides its axes. */
const Trend: React.FC<{ series: UsageBucket[]; period: UsageWindow; summary: UsageSummary; periodLabel: string }> = ({ series, period, summary, periodLabel }) => {
  const [measure, setMeasure] = useState<UsageMeasure>('cost');
  const [hovered, setHovered] = useState<number | null>(null);
  const option = useMemo<ChartOption>(() => ({
    grid: { left: C.inset, right: C.inset, top: C.inset, bottom: C.inset, containLabel: true },
    tooltip: { trigger: 'axis', showContent: false },
    xAxis: { type: 'category', data: series.map((b) => bucketLabel(b.key, period.bucket, 'short')) },
    yAxis: { type: 'value', splitNumber: 3, axisLabel: { formatter: (v: number) => formatTick(measure, v) } },
    series: [{ type: 'bar', name: MEASURE_LABEL[measure], data: series.map((b) => measureOf(measure, b)) }],
  }), [series, period.bucket, measure]);
  const day = hovered === null ? null : series[hovered];
  const peek = day
    ? peekLine(bucketLabel(day.key, period.bucket, 'long'), day)
    : peekLine(periodLabel, { calls: summary.total_calls, estimated_cost: summary.total_cost });
  return (
    <Section title={COPY.trend} accessory={<Tabs items={USAGE_CONFIG.measures} value={measure} onValueChange={setMeasure} label={COPY.measureLabel} />}>
      <div className="flex flex-col gap-1 py-3">
        <Text variant="figure" tone={day ? 'primary' : 'muted'}>{peek}</Text>
        <Chart option={option} height={C.trendHeight} label={`${MEASURE_LABEL[measure]} ${COPY.trend.toLowerCase()}`} onHover={setHovered} />
      </div>
    </Section>
  );
};

// ── 3 · Where it went ──

/** A slice's icon: the model's, the provider's, or the use case's. */
function markIcon(mark: SplitMark): React.ReactNode {
  if (mark.kind === 'useCase') return <Icon icon={USE_CASE_GLYPH[mark.category] ?? Sparkles} size="sm" />;
  return <ModelIcon provider={mark.provider} modelId={mark.kind === 'model' ? mark.model : undefined} size={C.rowIcon} />;
}

const toSlice = (measure: UsageMeasure) => (e: SplitEntry & { slot?: number }): DonutSlice => ({
  key: e.key,
  slot: e.slot,
  label: e.name,
  leading: markIcon(e.mark),
  value: measureOf(measure, e),
  valueText: measure === 'cost' ? costText(e.estimated_cost, e.unpriced) : formatMeasure('requests', e.calls),
});

const SplitDonut: React.FC<{ summary: UsageSummary; split: UsageSplit }> = ({ summary, split }) => {
  const [measure, setMeasure] = useState<UsageMeasure>('cost');
  const slices = useMemo(() => splitEntries(summary, split, measure).map(toSlice(measure)), [summary, split, measure]);
  const total = measure === 'cost' ? summary.total_cost : summary.total_calls;
  const format = useCallback((v: number) => formatMeasure(measure, v), [measure]);
  return (
    <Section title={COPY.splits[split]} accessory={<Tabs items={USAGE_CONFIG.measures} value={measure} onValueChange={setMeasure} label={COPY.measureLabel} />}>
      <div className="py-3">
        <DonutChart
          slices={slices}
          total={{ value: format(total), caption: MEASURE_LABEL[measure] }}
          formatValue={format}
          label={`${MEASURE_LABEL[measure]} ${COPY.splits[split].toLowerCase()}`}
        />
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
    sortValue: (m) => modelName(m.model),
    cell: (m) => <ModelCell provider={m.provider} modelId={m.model} name={modelName(m.model)} caption={providerName(m.provider)} />,
  },
  { key: 'requests', header: COL.requests, align: 'end', sortValue: (m) => m.calls, cell: (m) => figure(formatMeasure('requests', m.calls)) },
  { key: 'input', header: COL.input, align: 'end', sortValue: (m) => m.input_tokens, cell: (m) => figure(formatTokens(m.input_tokens)) },
  { key: 'cached', header: COL.cached, align: 'end', sortValue: (m) => m.cache_read_tokens, cell: (m) => figure(formatTokens(m.cache_read_tokens)) },
  { key: 'output', header: COL.output, align: 'end', sortValue: (m) => m.output_tokens, cell: (m) => figure(formatTokens(m.output_tokens)) },
  // speech is billed by its audio, so its length is its measure; text models heard none
  { key: 'audio', header: COL.audio, align: 'end', sortValue: (m) => m.audio_seconds, cell: (m) => figure(m.audio_seconds > 0 ? formatDuration(m.audio_seconds) : '—') },
  { key: 'cost', header: COL.cost, align: 'end', sortValue: (m) => m.estimated_cost, cell: (m) => figure(costText(m.estimated_cost, m.unpriced_calls)) },
  {
    key: 'per',
    header: COL.perRequest,
    align: 'end',
    sortValue: (m) => (m.calls > 0 ? m.estimated_cost / m.calls : 0),
    cell: (m) => figure(costText(m.calls > 0 ? m.estimated_cost / m.calls : 0, m.unpriced_calls)),
  },
];

const TOOL_COLUMNS: ReadonlyArray<DataColumn<ToolBreakdown>> = [
  {
    key: 'tool',
    header: COL.tool,
    sortValue: (t) => toolName(t.tool),
    cell: (t) => (
      <div className="flex min-w-0 items-center gap-2">
        <Icon icon={toolCallIcon(t.tool)} size="sm" />
        <Text truncate>{toolName(t.tool)}</Text>
      </div>
    ),
  },
  { key: 'calls', header: COL.calls, align: 'end', sortValue: (t) => t.calls, cell: (t) => figure(formatMeasure('requests', t.calls)) },
  { key: 'failed', header: COL.failed, align: 'end', sortValue: (t) => t.failed, cell: (t) => figure(formatMeasure('requests', t.failed)) },
  { key: 'time', header: COL.time, align: 'end', sortValue: (t) => t.avg_ms ?? -1, cell: (t) => figure(t.avg_ms === null ? '—' : formatMs(t.avg_ms)) },
  { key: 'last', header: COL.lastUsed, align: 'end', sortValue: (t) => t.last_used, cell: (t) => <Text tone="muted">{formatRelativeTime(t.last_used)}</Text> },
];

const dayColumns = (period: UsageWindow): ReadonlyArray<DataColumn<UsageBucket>> => [
  { key: 'date', header: COL.date, sortValue: (b) => b.key, cell: (b) => <Text>{bucketLabel(b.key, period.bucket, 'long')}</Text> },
  { key: 'requests', header: COL.requests, align: 'end', sortValue: (b) => b.calls, cell: (b) => figure(formatMeasure('requests', b.calls)) },
  { key: 'input', header: COL.input, align: 'end', sortValue: (b) => b.input_tokens, cell: (b) => figure(formatTokens(b.input_tokens)) },
  { key: 'cached', header: COL.cached, align: 'end', sortValue: (b) => b.cache_read_tokens, cell: (b) => figure(formatTokens(b.cache_read_tokens)) },
  { key: 'output', header: COL.output, align: 'end', sortValue: (b) => b.output_tokens, cell: (b) => figure(formatTokens(b.output_tokens)) },
  { key: 'cost', header: COL.cost, align: 'end', sortValue: (b) => b.estimated_cost, cell: (b) => figure(formatMeasure('cost', b.estimated_cost)) },
];

const Tables: React.FC<{ summary: UsageSummary; series: UsageBucket[]; period: UsageWindow }> = ({ summary, series, period }) => {
  const T = COPY.tables;
  const days = useMemo(() => series.filter((b) => b.calls > 0), [series]);
  const columns = useMemo(() => dayColumns(period), [period]);
  return (
    <>
      <Section title={T.models} layout="stack">
        <DataTable
          columns={MODEL_COLUMNS}
          rows={summary.by_provider_model}
          rowKey={(m) => `${m.provider}/${m.model}`}
          label={T.models}
          search={{ placeholder: COPY.search.models, text: (m) => `${m.model} ${providerName(m.provider)}` }}
          sort={{ key: 'cost', desc: true }}
          empty={COPY.noMatches}
        />
      </Section>
      <Section title={T.tools} layout="stack">
        <DataTable
          columns={TOOL_COLUMNS}
          rows={summary.by_tool}
          rowKey={(t) => t.tool}
          label={T.tools}
          search={{ placeholder: COPY.search.tools, text: (t) => toolName(t.tool) }}
          sort={{ key: 'calls', desc: true }}
          empty={summary.by_tool.length === 0 ? COPY.noTools : COPY.noMatches}
        />
      </Section>
      <Section title={T.days} layout="stack">
        <DataTable columns={columns} rows={days} rowKey={(b) => b.key} label={T.days} sort={{ key: 'date', desc: true }} empty={COPY.emptyPeriod} />
      </Section>
    </>
  );
};

// ── The page ──

interface StoryProps {
  summary: UsageSummary;
  previous: UsageSummary | undefined;
  period: UsageWindow;
  /** "30 days", for each KPI's change. */
  rangeLabel: string;
  /** "Last 30 days", for the trend's line. */
  periodLabel: string;
}

const Story: React.FC<StoryProps> = ({ summary, previous, period, rangeLabel, periodLabel }) => {
  const series = useMemo(() => fillSeries(bucketKeys(period, summary.first_timestamp, new Date()), summary.trend), [period, summary]);
  return (
    <>
      <Kpis summary={summary} previous={previous} rangeLabel={rangeLabel} />
      <Trend series={series} period={period} summary={summary} periodLabel={periodLabel} />
      <SplitDonut summary={summary} split="model" />
      <SplitDonut summary={summary} split="provider" />
      <SplitDonut summary={summary} split="useCase" />
      <Tables summary={summary} series={series} period={period} />
    </>
  );
};

export const ActivityTab: React.FC = () => {
  const range = useUsageRange();
  const setRange = useSetUsageRange();
  const { period, summary, previous, isLoading, error } = useUsageWindow(range);
  const current = USAGE_CONFIG.ranges.find((r) => r.value === range) ?? USAGE_CONFIG.ranges[0];

  return (
    <>
      <Tabs items={USAGE_CONFIG.ranges} value={range} onValueChange={setRange} label={COPY.rangeLabel} />
      <ScreenState
        loading={isLoading}
        error={error ? { cause: error, title: COPY.loadFailed } : null}
        empty={(!summary || summary.total_calls === 0) && { icon: ChartPie, message: range === 'all' ? COPY.empty : COPY.emptyPeriod }}
        className="flex flex-col gap-section"
      >
        {summary && <Story summary={summary} previous={previous ?? undefined} period={period} rangeLabel={current.label.toLowerCase()} periodLabel={current.period} />}
      </ScreenState>
    </>
  );
};
