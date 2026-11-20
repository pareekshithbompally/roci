/** Usage › Activity, top down: the range; KPIs (cost, requests, tokens, cost per request) with their change; the trend; where
 *  it went (by model, provider and use case); and every day as a table. One page, nothing to drill into. */

import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Callout, Chart, DataTable, Icon, Section, StatCard, Tabs, Text, type ChartOption, type DataColumn } from '@shared/ui';
import { LoadingPane } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';
import { USAGE_CONFIG, type UsageMeasure } from '@config/usage.config';
import type { UsageBucket, UsageSummary } from '@extensions/usage';
import { errorMessage } from '@shared/utils/errors';
import { bucketKeys, type UsageWindow } from '@features/usage/model/period';
import { fillSeries, measureOf, splitSlices, type UsageSplit } from '@features/usage/model/series';
import { bucketLabel, formatMeasure, formatTokens } from '@features/usage/model/format';
import { useUsageWindow } from '@features/usage/hooks/useUsageQueries';
import { useSetUsageRange, useUsageRange } from '@features/usage/stores/usageStore';

const COPY = USAGE_CONFIG.copy;
const C = UI_CONFIG.chart;
const PERCENT = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const MEASURE_LABEL = Object.fromEntries(USAGE_CONFIG.measures.map((m) => [m.value, m.label])) as Record<UsageMeasure, string>;

/** "+18% vs previous 30 days"; "New" when there was nothing before; none for all time or while the window before loads. */
function changeLine(current: number, previous: number | undefined, rangeLabel: string): string | undefined {
  if (previous === undefined) return undefined;
  if (previous === 0) return current === 0 ? undefined : `New vs previous ${rangeLabel}`;
  return `${PERCENT.format((current - previous) / previous)} vs previous ${rangeLabel}`;
}

/** The four headline figures. */
const Kpis: React.FC<{ summary: UsageSummary; previous: UsageSummary | undefined | null; rangeLabel: string }> = ({ summary, previous, rangeLabel }) => {
  const before = previous ?? undefined;
  const tokens = summary.total_input_tokens + summary.total_output_tokens;
  const perRequest = summary.total_calls > 0 ? summary.total_cost / summary.total_calls : 0;
  const costDetail = summary.unpriced_calls > 0 ? COPY.unpriced(summary.unpriced_calls) : changeLine(summary.total_cost, before?.total_cost, rangeLabel);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Cost" value={formatMeasure('cost', summary.total_cost)} detail={costDetail} />
      <StatCard label="Requests" value={formatMeasure('requests', summary.total_calls)} detail={changeLine(summary.total_calls, before?.total_calls, rangeLabel)} />
      <StatCard label="Tokens" value={formatTokens(tokens)} detail={`${formatTokens(summary.total_input_tokens)} in · ${formatTokens(summary.total_output_tokens)} out`} />
      <StatCard label="Cost per request" value={formatMeasure('cost', perRequest)} detail="Average" />
    </div>
  );
};

/** Cost or requests: the switch on a chart's label line. */
const MeasureSwitch: React.FC<{ value: UsageMeasure; onChange: (m: UsageMeasure) => void }> = ({ value, onChange }) => (
  <Tabs items={USAGE_CONFIG.measures} value={value} onValueChange={onChange} label="Measure" />
);

/** Every day (or month) of the window as a bar, empty ones included so time reads evenly. */
const Trend: React.FC<{ series: UsageBucket[]; period: UsageWindow }> = ({ series, period }) => {
  const [measure, setMeasure] = useState<UsageMeasure>('cost');
  const option = useMemo<ChartOption>(() => ({
    grid: { left: C.inset, right: C.inset, top: C.inset * 2, bottom: C.inset, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v) => formatMeasure(measure, Number(v)) },
    xAxis: { type: 'category', data: series.map((b) => bucketLabel(b.key, period.bucket, 'short')) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatMeasure(measure, v) } },
    series: [{ type: 'bar', name: MEASURE_LABEL[measure], data: series.map((b) => measureOf(measure, b)) }],
  }), [series, period.bucket, measure]);
  return (
    <Section title={COPY.trend(MEASURE_LABEL[measure])} accessory={<MeasureSwitch value={measure} onChange={setMeasure} />}>
      <div className="py-2">
        <Chart option={option} height={C.trendHeight} label={COPY.trend(MEASURE_LABEL[measure])} />
      </div>
    </Section>
  );
};

/** One split as a donut, its legend naming each slice with its value. */
const SplitDonut: React.FC<{ summary: UsageSummary; split: UsageSplit }> = ({ summary, split }) => {
  const [measure, setMeasure] = useState<UsageMeasure>('cost');
  const slices = useMemo(() => splitSlices(summary, split), [summary, split]);
  const total = slices.reduce((sum, s) => sum + measureOf(measure, s), 0);
  const option = useMemo<ChartOption>(() => {
    const valueOf = new Map(slices.map((s) => [s.name, formatMeasure(measure, measureOf(measure, s))]));
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', valueFormatter: (v) => formatMeasure(measure, Number(v)) },
      legend: { orient: 'vertical', bottom: 0, left: 'center', formatter: (name: string) => `${name}  ${valueOf.get(name) ?? ''}` },
      series: [{
        type: 'pie',
        name: COPY.splits[split],
        radius: ['58%', '88%'],
        bottom: C.donutLegendHeight,
        label: { show: false },
        data: slices.map((s) => ({ name: s.name, value: measureOf(measure, s) })),
      }],
    };
  }, [slices, measure, split]);
  return (
    <Section title={COPY.splits[split]} accessory={<MeasureSwitch value={measure} onChange={setMeasure} />}>
      <div className="py-3">
        {total > 0
          ? <Chart option={option} height={C.donutHeight + C.donutLegendHeight} label={`${MEASURE_LABEL[measure]} ${COPY.splits[split].toLowerCase()}`} />
          : <Text as="p" tone="muted" className="py-12 text-center">{COPY.nothing(MEASURE_LABEL[measure])}</Text>}
      </div>
    </Section>
  );
};

/** Each day (or month) with usage, newest first, every figure in its own column. */
const ByDay: React.FC<{ series: UsageBucket[]; period: UsageWindow }> = ({ series, period }) => {
  const T = COPY.table;
  const columns: ReadonlyArray<DataColumn<UsageBucket>> = [
    { key: 'date', header: T.date, cell: (b) => <Text>{bucketLabel(b.key, period.bucket, 'long')}</Text> },
    { key: 'requests', header: T.requests, align: 'end', cell: (b) => <Text variant="figure">{formatMeasure('requests', b.calls)}</Text> },
    { key: 'input', header: T.input, align: 'end', cell: (b) => <Text variant="figure">{formatTokens(b.input_tokens)}</Text> },
    { key: 'output', header: T.output, align: 'end', cell: (b) => <Text variant="figure">{formatTokens(b.output_tokens)}</Text> },
    { key: 'cost', header: T.cost, align: 'end', cell: (b) => <Text variant="figure">{formatMeasure('cost', b.estimated_cost)}</Text> },
  ];
  const rows = [...series].filter((b) => b.calls > 0).reverse();
  return (
    <Section title={T.label} layout="stack">
      <DataTable columns={columns} rows={rows} rowKey={(b) => b.key} label={T.label} />
    </Section>
  );
};

/** The page once its window has usage. */
const Story: React.FC<{ summary: UsageSummary; previous: UsageSummary | undefined | null; period: UsageWindow; rangeLabel: string }> = ({ summary, previous, period, rangeLabel }) => {
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
      <ByDay series={series} period={period} />
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
    return <Story summary={summary} previous={previous} period={period} rangeLabel={rangeLabel} />;
  };

  return (
    <>
      <Tabs items={USAGE_CONFIG.ranges} value={range} onValueChange={setRange} label="Range" />
      {body()}
    </>
  );
};
