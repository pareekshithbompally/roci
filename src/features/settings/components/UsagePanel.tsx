/** Read-only token usage and estimated cost, grouped by provider with subtotals. */

import React, { useMemo } from 'react';
import { DollarSign, Zap, TrendingUp, Loader2, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Callout, ChoiceControl, Icon, Surface, Text } from '@shared/ui';
import { SettingsPage } from './shared';
import { useUsageData } from '@features/settings/hooks/useUsageData';
import type { TimeRange } from '@features/settings/hooks/useUsageData';
import { formatTokenCount, formatCost, formatCategory } from '@extensions/usage/format';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

/** Provider / Model · Calls · Input · Output · Cost */
const TABLE_ROW = 'grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4';

export const UsagePanel: React.FC = () => {
  const { summary, isLoading, error, timeRange, setTimeRange } = useUsageData();

  const topModel = summary?.by_provider_model?.[0];

  // Group models by provider with per-provider subtotals
  const providerGroups = useMemo(() => {
    if (!summary) return [];
    const grouped: Record<string, {
      provider: string;
      calls: number;
      input_tokens: number;
      output_tokens: number;
      estimated_cost: number;
      models: typeof summary.by_provider_model;
    }> = {};

    for (const row of summary.by_provider_model) {
      if (!grouped[row.provider]) {
        grouped[row.provider] = {
          provider: row.provider,
          calls: 0,
          input_tokens: 0,
          output_tokens: 0,
          estimated_cost: 0,
          models: [],
        };
      }
      const g = grouped[row.provider];
      g.calls += row.calls;
      g.input_tokens += row.input_tokens;
      g.output_tokens += row.output_tokens;
      g.estimated_cost += row.estimated_cost;
      g.models.push(row);
    }

    return Object.values(grouped).sort((a, b) => b.estimated_cost - a.estimated_cost);
  }, [summary]);

  return (
    <SettingsPage
      title="Usage"
      description="Token usage and estimated costs across all AI operations."
      accessory={<ChoiceControl items={TIME_RANGE_OPTIONS} value={timeRange} onValueChange={setTimeRange} />}
    >
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Icon icon={Loader2} size="md" tone="muted" className="animate-spin" />
        </div>
      )}

      {!isLoading && error && (
        <Callout variant="warning" icon={<Icon icon={AlertTriangle} size="sm" />}>
          <Text as="p" tone="inherit">Failed to load usage data</Text>
          <Text as="p" variant="helper" tone="muted" className="mt-0.5">{error}</Text>
        </Callout>
      )}

      {!isLoading && !error && summary && summary.total_calls === 0 && (
        <Text as="p" tone="muted" className="text-center py-12">
          No usage data yet. Start a chat or transcribe a recording to see usage here.
        </Text>
      )}

      {!isLoading && summary && summary.total_calls > 0 && (
        <>
          {/* Summary Strip — 3 compact metrics inline */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard icon={DollarSign} label="Estimated Cost" value={formatCost(summary.total_cost)} />
            <SummaryCard
              icon={Zap}
              label="Tokens"
              value={`${formatTokenCount(summary.total_input_tokens)} in / ${formatTokenCount(summary.total_output_tokens)} out`}
            />
            <SummaryCard
              icon={TrendingUp}
              label="Top Model"
              value={topModel ? topModel.model : '—'}
              sublabel={topModel ? `${topModel.calls} calls · ${formatCost(topModel.estimated_cost)}` : undefined}
            />
          </div>

          {/* Unified table: grouped by provider, models nested */}
          <Surface variant="card" radius="lg" className="overflow-hidden">
            <Surface edge="bottom" className={`${TABLE_ROW} px-4 py-2`}>
              <Text variant="label" tone="faint">Provider / Model</Text>
              <Text variant="label" tone="faint" className="text-right w-12">Calls</Text>
              <Text variant="label" tone="faint" className="text-right w-16">Input</Text>
              <Text variant="label" tone="faint" className="text-right w-16">Output</Text>
              <Text variant="label" tone="faint" className="text-right w-16">Cost</Text>
            </Surface>

            {providerGroups.map((group, gi) => (
              <React.Fragment key={group.provider}>
                {/* Provider subtotal row */}
                <Surface variant="subtle" edge={gi > 0 ? 'top' : undefined} className={`${TABLE_ROW} px-4 py-2`}>
                  <Text variant="bodyStrong" className="capitalize">{group.provider}</Text>
                  <Text variant="mono" className="text-right w-12">{group.calls}</Text>
                  <Text variant="mono" tone="muted" className="text-right w-16">{formatTokenCount(group.input_tokens)}</Text>
                  <Text variant="mono" tone="muted" className="text-right w-16">{formatTokenCount(group.output_tokens)}</Text>
                  <Text variant="mono" className="text-right w-16">{formatCost(group.estimated_cost)}</Text>
                </Surface>

                {/* Model rows — indented */}
                {group.models.map((row) => (
                  <Surface key={`${row.provider}-${row.model}`} edge="top" className={`${TABLE_ROW} pl-8 pr-4 py-1.5`}>
                    <Text variant="mono" tone="muted" truncate>{row.model}</Text>
                    <Text variant="mono" tone="faint" className="text-right w-12">{row.calls}</Text>
                    <Text variant="mono" tone="faint" className="text-right w-16">{formatTokenCount(row.input_tokens)}</Text>
                    <Text variant="mono" tone="faint" className="text-right w-16">{formatTokenCount(row.output_tokens)}</Text>
                    <Text variant="mono" tone="muted" className="text-right w-16">{formatCost(row.estimated_cost)}</Text>
                  </Surface>
                ))}
              </React.Fragment>
            ))}

            {/* Grand total */}
            <Surface variant="subtle" edge="top" className={`${TABLE_ROW} px-4 py-2`}>
              <Text variant="bodyStrong">Total</Text>
              <Text variant="mono" className="font-medium text-right w-12">{summary.total_calls}</Text>
              <Text variant="mono" className="font-medium text-right w-16">{formatTokenCount(summary.total_input_tokens)}</Text>
              <Text variant="mono" className="font-medium text-right w-16">{formatTokenCount(summary.total_output_tokens)}</Text>
              <Text variant="mono" className="font-medium text-right w-16">{formatCost(summary.total_cost)}</Text>
            </Surface>
          </Surface>

          {/* Category breakdown — compact chips */}
          {summary.by_category.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Text variant="label" tone="faint">By category</Text>
              {summary.by_category.map((cat) => (
                <Surface key={cat.category} variant="inset" radius="md" className="inline-flex items-center gap-1.5 px-2.5 py-1">
                  <Text variant="helper">{formatCategory(cat.category)}</Text>
                  <Text variant="helper" tone="faint">{cat.calls}</Text>
                  <Text variant="mono" tone="muted">{formatCost(cat.estimated_cost)}</Text>
                </Surface>
              ))}
            </div>
          )}

          {/* Cache savings note */}
          {summary.total_cache_read_tokens > 0 && (
            <Text as="p" variant="helper" tone="faint">
              {formatTokenCount(summary.total_cache_read_tokens)} cached input tokens saved on prompt caching discounts.
            </Text>
          )}
        </>
      )}
    </SettingsPage>
  );
};

/** Small summary card component */
const SummaryCard: React.FC<{
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
}> = ({ icon, label, value, sublabel }) => (
  <Surface variant="card" radius="lg" className="px-3.5 py-3">
    <Text as="div" variant="helper" tone="faint" className="flex items-center gap-1.5 mb-1.5">
      <Icon icon={icon} size="xs" />
      {label}
    </Text>
    <Text as="div" variant="title" truncate className="font-mono">{value}</Text>
    {sublabel && <Text as="div" variant="helper" tone="muted" truncate className="mt-0.5">{sublabel}</Text>}
  </Surface>
);

export default UsagePanel;
