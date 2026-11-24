/** One model's or use case's page (an app's page in Screen Time): its own bars in its colour over the period on screen,
 *  what it was used for (a model) or which models ran it (a use case), then its figures. */

import React, { useMemo } from 'react';
import { ChartPie } from 'lucide-react';
import { CardRow, Chart, Section, Text, stackedBars } from '@shared/ui';
import { ScreenState } from '@shared/components';
import { SettingsPage } from '@features/settings/components/shared';
import { UI_CONFIG } from '@config/ui.config';
import { USAGE_CONFIG, type UsageMeasure, type UsageSplitBy } from '@config/usage.config';
import type { UsageSummary } from '@extensions/usage';
import { formatDuration } from '@shared/utils/formatters';
import { bucketKeys, elapsedBuckets, type UsageWindow } from '@features/usage/model/period';
import { leadMeasure, measureOf, pairedParts, partSeries, partsOf, providerName, type UsagePart } from '@features/usage/model/series';
import { axisLabel, costText, formatMeasure, formatTick, formatTokens, leadText } from '@features/usage/model/format';
import { priceText } from '@features/usage/model/prices';
import { useUsageWindow } from '@features/usage/hooks/useUsageQueries';
import { usePriceRows } from '@features/usage/hooks/useModelPrices';
import { useUsageOffset, useUsagePeriod } from '@features/usage/stores/usageStore';
import { PartIcon } from './PartIcon';

const COPY = USAGE_CONFIG.copy;
const D = COPY.detail;

interface UsagePartPageProps {
  /** `provider/model`, or the use case. */
  partKey: string;
  splitBy: UsageSplitBy;
  title: string;
  onBack?: () => void;
}

/** A model's figures: its provider, requests, tokens, audio, cost per request and the price that applies. */
const ModelInfo: React.FC<{ summary: UsageSummary; provider: string; model: string }> = ({ summary, provider, model }) => {
  const row = summary.by_provider_model.find((m) => m.provider === provider && m.model === model);
  const price = usePriceRows().rows.find((r) => r.provider === provider && r.modelId === model);
  if (!row) return null;
  const shownPrice = price && priceText(price);
  return (
    <Section title={D.info}>
      <CardRow title={D.provider} value={providerName(provider)} />
      <CardRow title={COPY.requests} value={formatMeasure('requests', row.calls)} />
      <CardRow title={COPY.tokens} value={`${COPY.tokensIn(formatTokens(row.input_tokens))} · ${COPY.tokensOut(formatTokens(row.output_tokens))}`} />
      {row.audio_seconds > 0 && <CardRow title={D.audio} value={formatDuration(row.audio_seconds)} />}
      <CardRow title={D.perRequest} value={costText(row.calls > 0 ? row.estimated_cost / row.calls : 0, row.unpriced_calls)} />
      {shownPrice && <CardRow title={D.price} value={shownPrice} />}
    </Section>
  );
};

/** A use case's figures: its requests, tokens and cost per request. */
const UseCaseInfo: React.FC<{ part: UsagePart }> = ({ part }) => (
  <Section title={D.info}>
    <CardRow title={COPY.requests} value={formatMeasure('requests', part.calls)} />
    <CardRow title={COPY.tokens} value={formatTokens(part.tokens)} />
    <CardRow title={D.perRequest} value={costText(part.calls > 0 ? part.estimated_cost / part.calls : 0, part.unpriced)} />
  </Section>
);

interface BodyProps {
  summary: UsageSummary;
  window: UsageWindow;
  part: UsagePart;
  splitBy: UsageSplitBy;
  measure: UsageMeasure;
}

const PartBody: React.FC<BodyProps> = ({ summary, window, part, splitBy, measure }) => {
  const period = useUsagePeriod();
  const { keys, elapsed } = useMemo(() => {
    const now = new Date();
    return { keys: bucketKeys(window, summary.first_timestamp, now), elapsed: elapsedBuckets(window, summary.first_timestamp, now) };
  }, [window, summary]);
  const option = useMemo(() => stackedBars({
    categories: keys.map((key) => axisLabel(key, period)),
    layers: [{ name: part.name, token: part.token, data: partSeries(summary, splitBy, part.key, keys, measure) }],
    formatValue: (v) => formatTick(measure, v),
  }), [keys, period, part, summary, splitBy, measure]);
  const others = useMemo(() => partsOf(summary, splitBy === 'model' ? 'useCase' : 'model', measure), [summary, splitBy, measure]);
  const pairs = pairedParts(summary, part.mark, others, measure);
  const top = pairs[0] ? measureOf(measure, pairs[0]) : 0;
  return (
    <>
      <Section title={COPY[measure]}>
        <div className="flex flex-col gap-1 py-3">
          <Text variant="display">{leadText(measure, part)}</Text>
          <Chart option={option} height={UI_CONFIG.chart.trendHeight} label={`${part.name} ${COPY[measure]}`} />
        </div>
        <CardRow title={COPY.average[window.bucket]} value={formatMeasure(measure, measureOf(measure, part) / elapsed)} />
      </Section>
      {pairs.length > 0 && (
        <Section title={part.mark.kind === 'model' ? D.usedFor : D.models}>
          {pairs.map((pair) => (
            <CardRow
              key={pair.key}
              title={pair.name}
              leading={<PartIcon mark={pair.mark} />}
              meter={{ share: top > 0 ? measureOf(measure, pair) / top : 0, token: pair.token, value: leadText(measure, pair) }}
            />
          ))}
        </Section>
      )}
      {part.mark.kind === 'model'
        ? <ModelInfo summary={summary} provider={part.mark.provider} model={part.mark.model} />
        : <UseCaseInfo part={part} />}
    </>
  );
};

export const UsagePartPage: React.FC<UsagePartPageProps> = ({ partKey, splitBy, title, onBack }) => {
  const { period: window, summary, isLoading, error } = useUsageWindow(useUsagePeriod(), useUsageOffset());
  const measure = summary ? leadMeasure(summary) : 'cost';
  const part = useMemo(() => (summary ? partsOf(summary, splitBy, measure).find((p) => p.key === partKey) : undefined), [summary, splitBy, measure, partKey]);
  return (
    <SettingsPage title={title} onBack={onBack}>
      <ScreenState
        loading={isLoading}
        error={error ? { cause: error, title: COPY.loadFailed } : null}
        empty={!part && { icon: ChartPie, message: COPY.emptyPeriod }}
        className="flex flex-col gap-section"
      >
        {summary && part && <PartBody summary={summary} window={window} part={part} splitBy={splitBy} measure={measure} />}
      </ScreenState>
    </SettingsPage>
  );
};
