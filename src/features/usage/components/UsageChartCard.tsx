/** The trend card: the metric pull-down, one headline (the period total, or the picked bar's day), and the bars. */

import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { BarChart, Button, Card, Icon, Text } from '@shared/ui';
import { Menu } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';
import { USAGE_CONFIG, type UsageMetric } from '@config/usage.config';
import type { UsageSummary } from '@extensions/usage';
import { niceTicks } from '@shared/utils/niceTicks';
import { bucketKeys, type UsageWindow } from '@features/usage/model/period';
import { fillSeries, metricValue, summaryTotals } from '@features/usage/model/series';
import { bucketLabel, formatMetric, formatTick, spanLabel, usageLine } from '@features/usage/model/format';
import type { UsageSubject } from '@features/usage/model/subject';
import { useSetUsageMetric, useUsageMetric } from '@features/usage/stores/usageStore';

/** Shown in place of a figure that is still loading. */
export const PENDING = '—';

const METRIC_LABEL = Object.fromEntries(USAGE_CONFIG.metrics.map((m) => [m.value, m.label])) as Record<UsageMetric, string>;

/** "Cost ⌄": the metric as a pull-down, on Mac and iOS alike. */
const MetricMenu: React.FC = () => {
  const metric = useUsageMetric();
  const setMetric = useSetUsageMetric();
  return (
    <Menu
      label="Metric"
      align="start"
      trigger={(
        <Button variant="link" size="inline">
          {METRIC_LABEL[metric]}
          <Icon icon={ChevronDown} size="xs" />
        </Button>
      )}
      items={USAGE_CONFIG.metrics.map((m) => ({ type: 'check' as const, label: m.label, checked: m.value === metric, onSelect: () => setMetric(m.value) }))}
    />
  );
};

interface UsageChartCardProps {
  subject: UsageSubject;
  /** The window's usage; absent while its first load runs, when the card keeps its full size with an empty plot. */
  summary: UsageSummary | undefined;
  period: UsageWindow;
}

/** A pick belongs to the series it was made in, so a new range or page starts unpicked without remounting the chart. */
interface Pick {
  series: string;
  index: number;
}

export const UsageChartCard: React.FC<UsageChartCardProps> = ({ subject, summary, period }) => {
  const metric = useUsageMetric();
  const [pick, setPick] = useState<Pick | null>(null);
  const firstTimestamp = summary?.first_timestamp ?? null;
  const trend = summary?.trend;

  const series = useMemo(
    () => fillSeries(bucketKeys(period, firstTimestamp, new Date()), trend ?? []),
    // A window is its bounds: a fresh object with the same bounds is the same series.
    [period.since, period.until, period.bucket, firstTimestamp, trend],
  );
  const seriesId = `${period.bucket}:${series[0]?.key}:${series.length}`;
  const data = useMemo(
    () => series.map((b) => ({ key: b.key, label: bucketLabel(b.key, period.bucket, 'short'), value: metricValue(metric, b) })),
    [series, period.bucket, metric],
  );
  const ticks = useMemo(
    () => niceTicks(Math.max(0, ...data.map((d) => d.value)), UI_CONFIG.chart.tickIntervals, metric === 'requests'),
    [data, metric],
  );

  const selected = pick?.series === seriesId ? pick.index : null;
  const bucket = selected === null ? null : series[selected];
  const span = spanLabel(series.map((b) => b.key), period.bucket);
  const value = bucket ?? (summary && summaryTotals(summary));
  const context = bucket ? `${bucketLabel(bucket.key, period.bucket, 'long')} · ${usageLine(bucket)}` : span;
  const step = ticks[1] - ticks[0];

  return (
    <Card>
      <div className="flex flex-col gap-3 py-4">
        <div className="flex flex-col items-start">
          <MetricMenu />
          <Text as="p" variant="display" aria-live="polite">{value ? formatMetric(metric, metricValue(metric, value)) : PENDING}</Text>
          <Text as="p" variant="helper" tone="muted" truncate className="max-w-full">{context}</Text>
        </div>
        <BarChart
          data={data}
          ticks={ticks}
          formatTick={(t) => formatTick(metric, t, step)}
          selected={selected}
          onSelect={(index) => setPick(index === null ? null : { series: seriesId, index })}
          label={`${METRIC_LABEL[metric]}, ${span}`}
        />
      </div>
    </Card>
  );
};
