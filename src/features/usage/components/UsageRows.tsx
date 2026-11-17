/** Usage rows: one shape for every list (Overview, breakdowns, history): leading icon, title, one line, value, drill chevron. */

import React from 'react';
import { CardRow, ICON_TILE_PX, IconTile, Text, type TileGlyph } from '@shared/ui';
import { ModelIcon, ProvidersAvatar } from '@shared/components';
import type { UsageMetric } from '@config/usage.config';
import type { CategoryBreakdown, ProviderModelBreakdown } from '@extensions/usage';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { formatMetric, usageLine } from '@features/usage/model/format';
import { metricValue, type UsageTotals } from '@features/usage/model/series';
import { modelName } from '@features/usage/model/subject';
import { categoryMark } from './marks';

/** A right-aligned figure in column digits. */
export const Figure: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text variant="figure" tone="muted">{children}</Text>
);

interface RowBase {
  /** Opens this item's own page; no chevron without it. */
  onOpen?: () => void;
  /** Loads that page's data ahead, on hover or keyboard focus. */
  onPrefetch?: () => void;
}

/** A total or highlight: tile, name, optional line, value. */
export const MetricRow: React.FC<RowBase & { icon: TileGlyph; title: string; description?: string; value: string }> = ({
  icon, title, description, value, onOpen, onPrefetch,
}) => (
  <CardRow
    leading={<IconTile icon={icon} />}
    title={title}
    description={description}
    status={<Figure>{value}</Figure>}
    onOpen={onOpen}
    onPointerEnter={onPrefetch}
    onFocus={onPrefetch}
  />
);

/** A provider's totals, its logo and name. */
export const ProviderRow: React.FC<RowBase & { provider: string; totals: UsageTotals; metric: UsageMetric }> = ({
  provider, totals, metric, onOpen, onPrefetch,
}) => (
  <CardRow
    leading={<ProvidersAvatar provider={provider} size={ICON_TILE_PX} />}
    title={getProviderTitle(provider)}
    description={usageLine(totals)}
    status={<Figure>{formatMetric(metric, metricValue(metric, totals))}</Figure>}
    onOpen={onOpen}
    onPointerEnter={onPrefetch}
    onFocus={onPrefetch}
  />
);

/** A model's totals, its org avatar or provider logo; `withProvider` names the provider when the list mixes them. */
export const ModelRow: React.FC<RowBase & { row: ProviderModelBreakdown; metric: UsageMetric; withProvider: boolean }> = ({
  row, metric, withProvider, onOpen, onPrefetch,
}) => (
  <CardRow
    leading={<ModelIcon provider={row.provider} modelId={row.model} size={ICON_TILE_PX} />}
    title={modelName(row.model)}
    description={usageLine(row, withProvider ? getProviderTitle(row.provider) : undefined)}
    status={<Figure>{formatMetric(metric, metricValue(metric, row))}</Figure>}
    onOpen={onOpen}
    onPointerEnter={onPrefetch}
    onFocus={onPrefetch}
  />
);

/** A feature's totals on its tile. */
export const FeatureRow: React.FC<RowBase & { row: CategoryBreakdown; metric: UsageMetric }> = ({ row, metric, onOpen, onPrefetch }) => {
  const mark = categoryMark(row.category);
  return (
    <MetricRow
      icon={mark.icon}
      title={mark.label}
      description={usageLine(row)}
      value={formatMetric(metric, metricValue(metric, row))}
      onOpen={onOpen}
      onPrefetch={onPrefetch}
    />
  );
};
