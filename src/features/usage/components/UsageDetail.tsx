/** One usage page for any subject (all, a provider, a model, a feature): range, trend, highlights, totals, splits, history.
 *  Pages form a tree, Usage › Provider › Model and Usage › Feature, so drilling always ends. */

import React, { useCallback, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Callout, Icon, Section, Tabs, Text, useOptionalNavStack } from '@shared/ui';
import { USAGE_CONFIG, type UsageMetric, type UsageRange } from '@config/usage.config';
import type { UsageSummary } from '@extensions/usage';
import { errorMessage } from '@shared/utils/errors';
import { SettingsPage } from '@features/settings/components/shared/SettingsPage';
import { bucketKeys, dayCount, type UsageWindow } from '@features/usage/model/period';
import { changeFrom, fillSeries, metricValue, peakBucket, perRequest, summaryTotals, totalsByProvider } from '@features/usage/model/series';
import { bucketLabel, formatAverage, formatChange, formatMetric, usageLine } from '@features/usage/model/format';
import { childKinds, type UsageChildKind, type UsageSubject } from '@features/usage/model/subject';
import { usePrefetchUsagePage, useUsagePage, type UsageView } from '@features/usage/hooks/useUsageQueries';
import {
  useOpenUsageInPanel, useSetUsageRange, useUsageBack, useUsageMetric, useUsageRange,
} from '@features/usage/stores/usageStore';
import { METRIC_GLYPH, USAGE_GLYPH, changeGlyph, subjectTitle } from './marks';
import { FeatureRow, MetricRow, ModelRow, ProviderRow } from './UsageRows';
import { PENDING, UsageChartCard } from './UsageChartCard';

const COPY = USAGE_CONFIG.copy;

interface Drill {
  /** Opens a child page: pushed inside a NavStack (iPhone), in place in the Settings panel (Mac, iPad). */
  open: (subject: UsageSubject) => void;
  /** Loads a child page's data ahead (row hover or focus), so it opens complete. */
  prefetch: (subject: UsageSubject) => void;
}

function useDrill(range: UsageRange): Drill {
  const nav = useOptionalNavStack();
  const openInPanel = useOpenUsageInPanel();
  const prefetchPage = usePrefetchUsagePage();
  const prefetch = useCallback((subject: UsageSubject) => prefetchPage(subject, range), [prefetchPage, range]);
  const open = useCallback((subject: UsageSubject) => {
    prefetch(subject);
    if (nav) nav.push({ title: subjectTitle(subject), content: <UsageDetail subject={subject} /> });
    else openInPanel(subject);
  }, [nav, openInPanel, prefetch]);
  return { open, prefetch };
}

/** The range control (segmented); it scopes everything below it. */
export const UsageRangeControl: React.FC = () => {
  const range = useUsageRange();
  const setRange = useSetUsageRange();
  return <Tabs items={USAGE_CONFIG.ranges} value={range} onValueChange={(r: UsageRange) => setRange(r)} />;
};

/** A failed load, or a window with no usage; otherwise nothing (a loading page keeps its own frame). */
const UsageState: React.FC<{ error: unknown; empty: string | null }> = ({ error, empty }) => {
  if (error) {
    return (
      <Callout variant="warning" icon={<Icon icon={AlertTriangle} size="sm" />}>
        <Text as="p" tone="inherit">{COPY.loadFailed}</Text>
        <Text as="p" variant="helper" tone="muted" className="mt-0.5">{errorMessage(error)}</Text>
      </Callout>
    );
  }
  if (empty) return <Text as="p" tone="muted" className="text-center py-12">{empty}</Text>;
  return null;
};

interface PageData {
  subject: UsageSubject;
  summary: UsageSummary;
  period: UsageWindow;
  range: UsageRange;
  metric: UsageMetric;
}

/** Change, daily average, peak bucket, per request: each derived from the recorded totals and buckets. */
const Highlights: React.FC<PageData & { previous: UsageView['previous'] }> = ({ summary, period, range, metric, previous }) => {
  const now = new Date();
  const totals = summaryTotals(summary);
  const current = metricValue(metric, totals);
  const days = dayCount(range, summary.first_timestamp, now);
  const series = fillSeries(bucketKeys(period, summary.first_timestamp, now), summary.trend);
  const peak = peakBucket(series, metric);
  const change = previous?.summary ? changeFrom(current, metricValue(metric, summaryTotals(previous.summary))) : null;
  const each = perRequest(metric, totals);
  const rangeLabel = USAGE_CONFIG.ranges.find((r) => r.value === range)?.label ?? '';

  return (
    <Section title={COPY.sections.highlights}>
      {previous && (previous.summary === undefined || change) && (
        <MetricRow
          icon={changeGlyph(change?.kind === 'ratio' ? change.ratio : 1)}
          title={`Previous ${rangeLabel.toLowerCase()}`}
          description={change?.kind === 'ratio' ? `${formatMetric(metric, change.previous)} then` : change ? 'None then' : PENDING}
          value={change ? formatChange(change) : PENDING}
        />
      )}
      <MetricRow icon={USAGE_GLYPH.average} title="Daily average" description={`Over ${days} ${days === 1 ? 'day' : 'days'}`} value={formatAverage(metric, current / days)} />
      {peak && (
        <MetricRow
          icon={USAGE_GLYPH.peak}
          title={period.bucket === 'day' ? 'Busiest day' : 'Busiest month'}
          description={bucketLabel(peak.key, period.bucket, 'long')}
          value={formatMetric(metric, metricValue(metric, peak))}
        />
      )}
      {each !== null && (
        <MetricRow icon={METRIC_GLYPH.requests} title="Per request" description={usageLine(totals)} value={formatAverage(metric, each)} />
      )}
    </Section>
  );
};

/** Every total the page's window recorded; plain rows (the chart's metric menu is how to see one over time). */
const Totals: React.FC<PageData> = ({ summary }) => (
  <Section title={COPY.sections.totals}>
    <MetricRow
      icon={METRIC_GLYPH.cost}
      title="Estimated cost"
      description={summary.unpriced_calls > 0 ? COPY.unpriced(summary.unpriced_calls) : undefined}
      value={formatMetric('cost', summary.total_cost)}
    />
    <MetricRow icon={METRIC_GLYPH.requests} title="Requests" value={formatMetric('requests', summary.total_calls)} />
    <MetricRow icon={USAGE_GLYPH.input} title="Input tokens" value={formatMetric('tokens', summary.total_input_tokens)} />
    <MetricRow icon={USAGE_GLYPH.output} title="Output tokens" value={formatMetric('tokens', summary.total_output_tokens)} />
    {summary.total_cache_read_tokens > 0 && (
      <MetricRow icon={USAGE_GLYPH.cached} title="Cached input tokens" value={formatMetric('tokens', summary.total_cache_read_tokens)} />
    )}
  </Section>
);

/** What the page splits into. Only its children (see `childKinds`) open a page; the other splits are information rows. */
const Breakdowns: React.FC<PageData & { drill: Drill }> = ({ subject, summary, metric, drill }) => {
  const opens = childKinds(subject);
  /** A child row opens its page and loads it on hover; any other split is information only. */
  const child = (kind: UsageChildKind, next: UsageSubject) =>
    opens.has(kind) ? { onOpen: () => drill.open(next), onPrefetch: () => drill.prefetch(next) } : {};
  return (
    <>
      {subject.kind === 'all' && (
        <Section title={COPY.sections.byProvider}>
          {totalsByProvider(summary.by_provider_model).map((p) => (
            <ProviderRow key={p.provider} provider={p.provider} totals={p} metric={metric} {...child('provider', { kind: 'provider', provider: p.provider })} />
          ))}
        </Section>
      )}
      {(subject.kind === 'provider' || subject.kind === 'feature') && (
        <Section title={COPY.sections.byModel}>
          {summary.by_provider_model.map((m) => (
            <ModelRow
              key={`${m.provider}/${m.model}`}
              row={m}
              metric={metric}
              withProvider={subject.kind === 'feature'}
              {...child('model', { kind: 'model', provider: m.provider, model: m.model })}
            />
          ))}
        </Section>
      )}
      {subject.kind !== 'feature' && summary.by_category.length > 0 && (
        <Section title={COPY.sections.byFeature}>
          {summary.by_category.map((c) => (
            <FeatureRow key={c.category} row={c} metric={metric} {...child('feature', { kind: 'feature', category: c.category })} />
          ))}
        </Section>
      )}
    </>
  );
};

/** The chart as rows: each day (or month) that has usage, newest first, so no value needs hovering to read. */
const History: React.FC<PageData> = ({ summary, period, metric }) => (
  <Section title={COPY.sections.history}>
    {[...summary.trend].reverse().map((b) => (
      <MetricRow
        key={b.key}
        icon={METRIC_GLYPH[metric]}
        title={bucketLabel(b.key, period.bucket, 'long')}
        description={usageLine(b)}
        value={formatMetric(metric, metricValue(metric, b))}
      />
    ))}
  </Section>
);

/** A usage page. The root (`subject` all) is Settings › Usage itself: its own title, no back button. */
export const UsageDetail: React.FC<{ subject: UsageSubject }> = ({ subject }) => {
  const root = subject.kind === 'all';
  const range = useUsageRange();
  const metric = useUsageMetric();
  const back = useUsageBack();
  const inStack = useOptionalNavStack() !== null;
  const drill = useDrill(range);
  const { period, summary, previous, error } = useUsagePage(subject, range);
  const prefetchPage = usePrefetchUsagePage();
  // Every range of this page loads up front, so switching ranges is instant.
  useEffect(() => {
    for (const r of USAGE_CONFIG.ranges) prefetchPage(subject, r.value);
  }, [prefetchPage, subject]);
  const empty = summary?.total_calls === 0;
  const page = { subject, period, range, metric };

  return (
    <SettingsPage
      title={root ? COPY.title : subjectTitle(subject)}
      onBack={root || inStack ? undefined : back}
    >
      <UsageRangeControl />
      <UsageState error={error} empty={empty ? (root ? COPY.empty : COPY.emptyPeriod) : null} />
      {!error && !empty && <UsageChartCard subject={subject} summary={summary} period={period} />}
      {summary && !empty && (
        <>
          <Highlights {...page} summary={summary} previous={previous} />
          <Totals {...page} summary={summary} />
          <Breakdowns {...page} summary={summary} drill={drill} />
          <History {...page} summary={summary} />
        </>
      )}
    </SettingsPage>
  );
};
