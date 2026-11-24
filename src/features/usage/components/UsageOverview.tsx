/** Usage, laid out as Screen Time: the period (Week · Month · All, stepped ‹ This Week ›), the lead figure (cost, or
 *  requests where nothing cost money) over a bar chart stacked by model or use case, Most Used (Show Use Cases flips both in
 *  place), then Requests and Tokens. A tap on a bar shows that day below; each Most Used row opens its own page. */

import React, { useMemo, useState } from 'react';
import { ChartPie } from 'lucide-react';
import { Button, CardRow, Chart, ChartLegend, Section, StepLabel, Tabs, Text, stackedBars } from '@shared/ui';
import { ScreenState } from '@shared/components';
import type { DrillPage } from '@features/settings/components/shared';
import { UI_CONFIG } from '@config/ui.config';
import { USAGE_CONFIG, type UsageMeasure, type UsagePeriod, type UsageSplitBy } from '@config/usage.config';
import type { UsageBucket, UsageSummary } from '@extensions/usage';
import { bucketKeys, elapsedBuckets, type UsageWindow } from '@features/usage/model/period';
import { busiest, dayParts, fillSeries, leadMeasure, measureOf, partsOf, stackLayers, type UsagePart } from '@features/usage/model/series';
import { axisLabel, bucketLabel, formatMeasure, formatTick, formatTokens, leadText, periodName } from '@features/usage/model/format';
import { useUsageWindow } from '@features/usage/hooks/useUsageQueries';
import { usePriceRows } from '@features/usage/hooks/useModelPrices';
import { useSetUsagePeriod, useStepUsage, useToggleUsageSplit, useUsageOffset, useUsagePeriod, useUsageSplitBy } from '@features/usage/stores/usageStore';
import { PartIcon } from './PartIcon';
import { UsagePartPage } from './UsagePartPage';
import { UsageToolsPage } from './UsageToolsPage';
import { PricesPage } from './PricesPage';

const COPY = USAGE_CONFIG.copy;
const C = UI_CONFIG.chart;
const SHARE = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });

/** Opens a page: pushed on iPhone, in place of the pane on Mac (usePaneDrill). */
type Open = (page: DrillPage) => void;

/** What every card reads: the period's summary and its buckets, filled so the axis runs whole. */
interface PeriodData {
  summary: UsageSummary;
  window: UsageWindow;
  period: UsagePeriod;
  keys: string[];
  series: UsageBucket[];
  /** Buckets begun so far, for the averages. */
  elapsed: number;
}

// ── The lead card ──

/** "12% less than the week before"; none for all time, or with nothing before to compare. */
function changeText(current: number, previous: UsageSummary | undefined, measure: UsageMeasure, period: UsagePeriod): string | null {
  const before = previous ? measureOf(measure, { calls: previous.total_calls, estimated_cost: previous.total_cost }) : 0;
  if (period === 'all' || before === 0) return null;
  return COPY.change(SHARE.format(Math.abs(current - before) / before), current > before, period);
}

interface LeadCardProps {
  data: PeriodData;
  previous: UsageSummary | undefined;
  parts: UsagePart[];
  splitBy: UsageSplitBy;
  measure: UsageMeasure;
  picked: number | null;
  onPick: (index: number | null) => void;
}

const LeadCard: React.FC<LeadCardProps> = ({ data, previous, parts, splitBy, measure, picked, onPick }) => {
  const { summary, window, period, keys, series, elapsed } = data;
  const layers = useMemo(() => stackLayers(summary, parts, splitBy, keys, measure), [summary, parts, splitBy, keys, measure]);
  const option = useMemo(() => stackedBars({
    categories: keys.map((key) => axisLabel(key, period)),
    layers,
    formatValue: (v) => formatTick(measure, v),
    selected: picked,
  }), [keys, period, layers, measure, picked]);
  const total = measureOf(measure, { calls: summary.total_calls, estimated_cost: summary.total_cost });
  const day = picked === null ? null : series[picked];
  const change = changeText(total, previous, measure, period);
  const value = (v: number) => formatMeasure(measure, v);
  return (
    <Section title={COPY[measure]} footer={measure === 'cost' && summary.unpriced_calls > 0 ? COPY.unpriced(summary.unpriced_calls) : undefined}>
      <div className="flex flex-col gap-1 py-3">
        <Text variant="caption" tone="muted">{day ? bucketLabel(day.key, window.bucket, 'long') : COPY.average[window.bucket]}</Text>
        <Text variant="display">{value(day ? measureOf(measure, day) : total / elapsed)}</Text>
        <Chart option={option} height={C.trendHeight} label={COPY[measure]} onSelect={(i) => onPick(i === picked ? null : i)} />
        <ChartLegend
          items={layers.map((layer) => ({ token: layer.token, label: layer.name, value: value(picked === null ? layer.data.reduce((a, b) => a + b, 0) : layer.data[picked]) }))}
        />
      </div>
      {day
        ? <CardRow title={COPY.wholePeriod} tone="accent" onPress={() => onPick(null)} />
        : <CardRow title={COPY.total[measure]} value={value(total)} />}
      {!day && change && <CardRow title={change} />}
    </Section>
  );
};

// ── Most Used ──

interface MostUsedProps {
  parts: UsagePart[];
  splitBy: UsageSplitBy;
  measure: UsageMeasure;
  open: Open;
}

const MostUsed: React.FC<MostUsedProps> = ({ parts, splitBy, measure, open }) => {
  const toggle = useToggleUsageSplit();
  const [all, setAll] = useState(false);
  const top = parts[0] ? measureOf(measure, parts[0]) : 0;
  const shown = all ? parts : parts.slice(0, USAGE_CONFIG.mostUsedRows);
  const openPart = (part: UsagePart) => open({
    title: part.name,
    render: (close) => <UsagePartPage partKey={part.key} splitBy={splitBy} title={part.name} onBack={close} />,
  });
  return (
    <Section title={COPY.mostUsed} accessory={<Button variant="link" size="inline" onClick={toggle}>{COPY.show[splitBy]}</Button>}>
      {shown.length === 0 && <CardRow title={COPY.emptyPeriod} />}
      {shown.map((part) => (
        <CardRow
          key={part.key}
          title={part.name}
          leading={<PartIcon mark={part.mark} />}
          meter={{ share: top > 0 ? measureOf(measure, part) / top : 0, token: part.token, value: leadText(measure, part) }}
          onOpen={() => openPart(part)}
        />
      ))}
      {parts.length > USAGE_CONFIG.mostUsedRows && <CardRow title={all ? COPY.showLess : COPY.showMore} tone="accent" onPress={() => setAll(!all)} />}
    </Section>
  );
};

// ── Requests and Tokens ──

/** Requests per bucket, when the lead card shows cost (else it already leads with them). */
const RequestsCard: React.FC<{ data: PeriodData }> = ({ data }) => {
  const { summary, window, period, keys, series, elapsed } = data;
  const option = useMemo(() => stackedBars({
    categories: keys.map((key) => axisLabel(key, period)),
    layers: [{ name: COPY.requests, token: '--viz-1', data: series.map((b) => b.calls) }],
    formatValue: (v) => formatTick('requests', v),
  }), [keys, period, series]);
  const peak = busiest(series, 'requests');
  return (
    <Section title={COPY.requests}>
      <div className="flex flex-col gap-1 py-3">
        <Text variant="caption" tone="muted">{COPY.average[window.bucket]}</Text>
        <Text variant="display">{formatMeasure('requests', summary.total_calls / elapsed)}</Text>
        <Chart option={option} height={C.trendHeight} label={COPY.requests} />
      </div>
      {peak && <CardRow title={COPY.busiest[window.bucket]} value={`${bucketLabel(peak.key, window.bucket, 'long')} · ${formatMeasure('requests', peak.calls)}`} />}
      <CardRow title={COPY.total.requests} value={formatMeasure('requests', summary.total_calls)} />
    </Section>
  );
};

const TokensCard: React.FC<{ data: PeriodData }> = ({ data }) => {
  const { summary, window, elapsed } = data;
  const input = summary.total_input_tokens;
  const total = input + summary.total_output_tokens;
  const cached = input > 0 ? COPY.cached(SHARE.format(summary.total_cache_read_tokens / input)) : null;
  const detail = [COPY.tokensIn(formatTokens(input)), COPY.tokensOut(formatTokens(summary.total_output_tokens)), cached].filter(Boolean).join(' · ');
  return (
    <Section title={COPY.tokens}>
      <div className="flex flex-col gap-1 py-3">
        <Text variant="caption" tone="muted">{COPY.average[window.bucket]}</Text>
        <Text variant="display">{formatTokens(total / elapsed)}</Text>
        <Text variant="helper" tone="muted">{detail}</Text>
      </div>
      <CardRow title={COPY.total.tokens} value={formatTokens(total)} />
    </Section>
  );
};

// ── The period ──

const Period: React.FC<{ summary: UsageSummary; previous: UsageSummary | undefined; window: UsageWindow; period: UsagePeriod; open: Open }> = ({ summary, previous, window, period, open }) => {
  const splitBy = useUsageSplitBy();
  const measure = leadMeasure(summary);
  const [picked, setPicked] = useState<number | null>(null);
  const data = useMemo<PeriodData>(() => {
    const now = new Date();
    const keys = bucketKeys(window, summary.first_timestamp, now);
    return { summary, window, period, keys, series: fillSeries(keys, summary.trend), elapsed: elapsedBuckets(window, summary.first_timestamp, now) };
  }, [summary, window, period]);
  const parts = useMemo(() => partsOf(summary, splitBy, measure), [summary, splitBy, measure]);
  const listed = picked === null ? parts : dayParts(summary, parts, splitBy, data.keys[picked], measure);
  return (
    <>
      <LeadCard data={data} previous={previous} parts={parts} splitBy={splitBy} measure={measure} picked={picked} onPick={setPicked} />
      <MostUsed parts={listed} splitBy={splitBy} measure={measure} open={open} />
      {measure === 'cost' && <RequestsCard data={data} />}
      <TokensCard data={data} />
    </>
  );
};

/** The rows that open their own pages, whatever the period holds. */
const Pages: React.FC<{ summary: UsageSummary | undefined; open: Open }> = ({ summary, open }) => {
  const unpriced = usePriceRows().rows.filter((row) => row.source === 'unknown').length;
  return (
    <Section>
      <CardRow
        title={COPY.pages.tools}
        value={summary ? String(summary.by_tool.length) : undefined}
        onOpen={() => open({ title: COPY.pages.tools, render: (close) => <UsageToolsPage title={COPY.pages.tools} onBack={close} /> })}
      />
      <CardRow
        title={COPY.pages.prices}
        value={COPY.noPriceCount(unpriced)}
        onOpen={() => open({ title: COPY.pages.prices, render: (close) => <PricesPage title={COPY.pages.prices} onBack={close} /> })}
      />
    </Section>
  );
};

export const UsageOverview: React.FC<{ open: Open }> = ({ open }) => {
  const period = useUsagePeriod();
  const offset = useUsageOffset();
  const setPeriod = useSetUsagePeriod();
  const step = useStepUsage();
  const { period: window, summary, previous, isLoading, error } = useUsageWindow(period, offset);
  return (
    <>
      <Tabs items={USAGE_CONFIG.periods} value={period} onValueChange={setPeriod} label={COPY.periodLabel} />
      {period !== 'all' && (
        <StepLabel
          label={periodName(period, offset, window)}
          onStep={step}
          canStepForward={offset > 0}
          previousLabel={COPY.step.earlier}
          nextLabel={COPY.step.later}
        />
      )}
      <ScreenState
        loading={isLoading}
        error={error ? { cause: error, title: COPY.loadFailed } : null}
        empty={(!summary || summary.total_calls === 0) && { icon: ChartPie, message: period === 'all' ? COPY.empty : COPY.emptyPeriod }}
        className="flex flex-col gap-section"
      >
        {/* A new period starts with no day picked. */}
        {summary && <Period key={`${period}-${offset}`} summary={summary} previous={previous ?? undefined} window={window} period={period} open={open} />}
      </ScreenState>
      <Pages summary={summary} open={open} />
    </>
  );
};
