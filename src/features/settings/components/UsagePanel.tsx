/** Read-only token usage and estimated cost: totals, then by provider, by model and by feature, as grouped Settings rows. */

import React, { useMemo } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  ArrowLineDownIcon, ArrowLineUpIcon, CurrencyCircleDollarIcon, DatabaseIcon, LightbulbIcon, PaperPlaneTiltIcon, PencilSimpleLineIcon,
} from '@phosphor-icons/react';
import { Callout, CardRow, ChoiceControl, Icon, ICON_TILE_PX, IconTile, Section, Text, type TileGlyph } from '@shared/ui';
import { ModelIcon, ProvidersAvatar } from '@shared/components';
import { META_SEPARATOR, TILE_DOMAIN, type TileTint } from '@config/ui.config';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { JOB_GLYPH, SettingsPage } from './shared';
import { useUsageData } from '@features/settings/hooks/useUsageData';
import type { TimeRange } from '@features/settings/hooks/useUsageData';
import { formatTokenCount, formatCost } from '@extensions/usage/format';
import type { ProviderModelBreakdown, UsageCategory } from '@extensions/usage';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

/** Each feature's row: its name, glyph and hue (hue from its modality, as in Capabilities). */
const CATEGORY_MARK: Record<UsageCategory, { label: string; icon: TileGlyph; tint: TileTint }> = {
  chat: { label: 'Chat', icon: JOB_GLYPH.chat, tint: TILE_DOMAIN.text },
  suggestions: { label: 'Suggestions', icon: LightbulbIcon, tint: TILE_DOMAIN.text },
  'title-gen': { label: 'Chat titles', icon: PencilSimpleLineIcon, tint: TILE_DOMAIN.text },
  summary: { label: 'Summaries', icon: JOB_GLYPH.summaries, tint: TILE_DOMAIN.meetings },
  transcription: { label: 'Transcription', icon: JOB_GLYPH.transcription, tint: TILE_DOMAIN.speech },
};

type Totals = Pick<ProviderModelBreakdown, 'calls' | 'input_tokens' | 'output_tokens' | 'estimated_cost'>;

/** "72 requests · 239.3k in · 42.0k out"; token counts only when the provider reports them. */
function usageLine({ calls, input_tokens, output_tokens }: Totals, prefix?: string): string {
  const parts = [prefix, `${calls} ${calls === 1 ? 'request' : 'requests'}`];
  if (input_tokens > 0) parts.push(`${formatTokenCount(input_tokens)} in`);
  if (output_tokens > 0) parts.push(`${formatTokenCount(output_tokens)} out`);
  return parts.filter(Boolean).join(META_SEPARATOR);
}

/** Model rows summed per provider, most expensive (then busiest) first. */
function totalsByProvider(rows: ProviderModelBreakdown[]): Array<Totals & { provider: string }> {
  const byProvider = new Map<string, Totals & { provider: string }>();
  for (const row of rows) {
    const t = byProvider.get(row.provider) ?? { provider: row.provider, calls: 0, input_tokens: 0, output_tokens: 0, estimated_cost: 0 };
    t.calls += row.calls;
    t.input_tokens += row.input_tokens;
    t.output_tokens += row.output_tokens;
    t.estimated_cost += row.estimated_cost;
    byProvider.set(row.provider, t);
  }
  return [...byProvider.values()].sort((a, b) => b.estimated_cost - a.estimated_cost || b.calls - a.calls);
}

/** Model id without its org prefix ("ggml-org/gemma…" → "gemma…"); the org shows as the row's avatar. */
const modelName = (id: string) => id.slice(id.lastIndexOf('/') + 1);

const Figure: React.FC<{ children: React.ReactNode }> = ({ children }) => <Text variant="figure" tone="muted">{children}</Text>;

/** A total: tile, name, and its value on the right. */
const MetricRow: React.FC<{ icon: TileGlyph; title: string; value: string }> = ({ icon, title, value }) => (
  <CardRow leading={<IconTile icon={icon} tint={TILE_DOMAIN.activity} />} leadingAlign="row" title={title} status={<Figure>{value}</Figure>} />
);

export const UsagePanel: React.FC = () => {
  const { summary, isLoading, error, timeRange, setTimeRange } = useUsageData();
  const providers = useMemo(() => totalsByProvider(summary?.by_provider_model ?? []), [summary]);

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
          <Section title="Overview">
            <MetricRow icon={CurrencyCircleDollarIcon} title="Estimated cost" value={formatCost(summary.total_cost)} />
            <MetricRow icon={PaperPlaneTiltIcon} title="Requests" value={String(summary.total_calls)} />
            <MetricRow icon={ArrowLineDownIcon} title="Input tokens" value={formatTokenCount(summary.total_input_tokens)} />
            <MetricRow icon={ArrowLineUpIcon} title="Output tokens" value={formatTokenCount(summary.total_output_tokens)} />
            {summary.total_cache_read_tokens > 0 && (
              <MetricRow icon={DatabaseIcon} title="Cached input tokens" value={formatTokenCount(summary.total_cache_read_tokens)} />
            )}
          </Section>

          <Section title="By provider">
            {providers.map((p) => (
              <CardRow
                key={p.provider}
                leading={<ProvidersAvatar provider={p.provider} size={ICON_TILE_PX} />}
                leadingAlign="row"
                title={getProviderTitle(p.provider)}
                description={usageLine(p)}
                status={<Figure>{formatCost(p.estimated_cost)}</Figure>}
              />
            ))}
          </Section>

          <Section title="By model">
            {summary.by_provider_model.map((m) => (
              <CardRow
                key={`${m.provider}/${m.model}`}
                leading={<ModelIcon provider={m.provider} modelId={m.model} size={ICON_TILE_PX} />}
                leadingAlign="row"
                title={modelName(m.model)}
                description={usageLine(m, getProviderTitle(m.provider))}
                status={<Figure>{formatCost(m.estimated_cost)}</Figure>}
              />
            ))}
          </Section>

          {summary.by_category.length > 0 && (
            <Section title="By feature">
              {summary.by_category.map((c) => {
                const mark = CATEGORY_MARK[c.category as UsageCategory];
                return (
                  <CardRow
                    key={c.category}
                    leading={<IconTile icon={mark.icon} tint={mark.tint} />}
                    leadingAlign="row"
                    title={mark.label}
                    description={usageLine(c)}
                    status={<Figure>{formatCost(c.estimated_cost)}</Figure>}
                  />
                );
              })}
            </Section>
          )}
        </>
      )}
    </SettingsPage>
  );
};

export default UsagePanel;
