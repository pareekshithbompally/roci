/**
 * UsagePanel Component
 *
 * Displays token usage and estimated costs across all AI operations.
 * Read-only panel — no save footer needed.
 *
 * Single grouped table: rows grouped by provider with subtotal headers,
 * model rows nested within. Category shown as compact secondary section.
 */

import React, { useMemo } from 'react';
import { DollarSign, Zap, TrendingUp, Loader2, AlertTriangle } from 'lucide-react';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS, LAYOUT } from '@config/theme.config';
import { useUsageData } from '../hooks/useUsageData';
import type { TimeRange } from '../hooks/useUsageData';
import { formatTokenCount, formatCost, formatCategory } from '@extensions/usage/format';

const TIME_RANGE_OPTIONS: { id: TimeRange; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

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
    <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-6`}>
      {/* Header + Time Range on same line */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
            Usage
          </h3>
          <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
            Token usage and estimated costs across all AI operations.
          </p>
        </div>
        <div className={`inline-flex ${RADIUS.md} border ${BORDER.default} overflow-hidden shrink-0`}>
          {TIME_RANGE_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTimeRange(id)}
              className={`px-2.5 py-1 ${TYPOGRAPHY_CLASSES.settingsHelper} font-medium transition-colors ${
                timeRange === id
                  ? `${SURFACE.selectedCard} ${TEXT.heading}`
                  : `${TEXT.muted} ${SURFACE.hoverSubtle}`
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className={`w-5 h-5 ${TEXT.muted} animate-spin`} />
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className={`flex items-center gap-3 px-4 py-3 border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card}`}>
          <AlertTriangle className={`w-4 h-4 text-amber-500 shrink-0`} />
          <div>
            <p className={`${TYPOGRAPHY_CLASSES.settingsInput} ${TEXT.heading}`}>Failed to load usage data</p>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} mt-0.5`}>{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && summary && summary.total_calls === 0 && (
        <div className={`text-center py-12 ${TEXT.muted} ${TYPOGRAPHY_CLASSES.settingsDescription}`}>
          No usage data yet. Start a chat or transcribe a recording to see usage here.
        </div>
      )}

      {/* Content */}
      {!isLoading && summary && summary.total_calls > 0 && (
        <>
          {/* Summary Strip — 3 compact metrics inline */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard
              icon={<DollarSign className="w-3.5 h-3.5" />}
              label="Estimated Cost"
              value={formatCost(summary.total_cost)}
            />
            <SummaryCard
              icon={<Zap className="w-3.5 h-3.5" />}
              label="Tokens"
              value={`${formatTokenCount(summary.total_input_tokens)} in / ${formatTokenCount(summary.total_output_tokens)} out`}
            />
            <SummaryCard
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="Top Model"
              value={topModel ? topModel.model : '—'}
              sublabel={topModel ? `${topModel.calls} calls · ${formatCost(topModel.estimated_cost)}` : undefined}
            />
          </div>

          {/* Unified table: grouped by provider, models nested */}
          <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} overflow-hidden`}>
            {/* Table header */}
            <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b ${BORDER.subtle} ${TYPOGRAPHY_CLASSES.settingsHelper} font-medium ${TEXT.faint}`}>
              <span>Provider / Model</span>
              <span className="text-right w-12">Calls</span>
              <span className="text-right w-16">Input</span>
              <span className="text-right w-16">Output</span>
              <span className="text-right w-16">Cost</span>
            </div>

            {/* Provider groups */}
            {providerGroups.map((group, gi) => (
              <React.Fragment key={group.provider}>
                {/* Provider subtotal row */}
                <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 ${SURFACE.subtle} ${gi > 0 ? `border-t ${BORDER.subtle}` : ''}`}>
                  <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading} capitalize`}>
                    {group.provider}
                  </span>
                  <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.heading} text-right w-12`}>
                    {group.calls}
                  </span>
                  <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.muted} text-right w-16`}>
                    {formatTokenCount(group.input_tokens)}
                  </span>
                  <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.muted} text-right w-16`}>
                    {formatTokenCount(group.output_tokens)}
                  </span>
                  <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.heading} text-right w-16`}>
                    {formatCost(group.estimated_cost)}
                  </span>
                </div>

                {/* Model rows — indented */}
                {group.models.map((row) => (
                  <div
                    key={`${row.provider}-${row.model}`}
                    className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 pl-8 pr-4 py-1.5 border-t ${BORDER.subtle}`}
                  >
                    <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.secondary} truncate`}>
                      {row.model}
                    </span>
                    <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.faint} text-right w-12`}>
                      {row.calls}
                    </span>
                    <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.faint} text-right w-16`}>
                      {formatTokenCount(row.input_tokens)}
                    </span>
                    <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.faint} text-right w-16`}>
                      {formatTokenCount(row.output_tokens)}
                    </span>
                    <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono ${TEXT.muted} text-right w-16`}>
                      {formatCost(row.estimated_cost)}
                    </span>
                  </div>
                ))}
              </React.Fragment>
            ))}

            {/* Grand total */}
            <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-t ${BORDER.default} ${SURFACE.subtle}`}>
              <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} font-medium ${TEXT.heading}`}>
                Total
              </span>
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono font-medium ${TEXT.heading} text-right w-12`}>
                {summary.total_calls}
              </span>
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono font-medium ${TEXT.heading} text-right w-16`}>
                {formatTokenCount(summary.total_input_tokens)}
              </span>
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono font-medium ${TEXT.heading} text-right w-16`}>
                {formatTokenCount(summary.total_output_tokens)}
              </span>
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-mono font-medium ${TEXT.heading} text-right w-16`}>
                {formatCost(summary.total_cost)}
              </span>
            </div>
          </div>

          {/* Category breakdown — compact chips */}
          {summary.by_category.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} font-medium ${TEXT.faint}`}>By category</span>
              {summary.by_category.map((cat) => (
                <span
                  key={cat.category}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${SURFACE.chip} border ${BORDER.default} ${RADIUS.md} ${TYPOGRAPHY_CLASSES.settingsHelper}`}
                >
                  <span className={TEXT.heading}>{formatCategory(cat.category)}</span>
                  <span className={TEXT.faint}>{cat.calls}</span>
                  <span className={`${TEXT.muted} font-mono`}>{formatCost(cat.estimated_cost)}</span>
                </span>
              ))}
            </div>
          )}

          {/* Cache savings note */}
          {summary.total_cache_read_tokens > 0 && (
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
              {formatTokenCount(summary.total_cache_read_tokens)} cached input tokens saved on prompt caching discounts.
            </p>
          )}
        </>
      )}
    </div>
    </div>
  );
};

/** Small summary card component */
const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
}> = ({ icon, label, value, sublabel }) => (
  <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} px-3.5 py-3`}>
    <div className={`flex items-center gap-1.5 ${TEXT.faint} mb-1.5`}>
      {icon}
      <span className={TYPOGRAPHY_CLASSES.settingsHelper}>{label}</span>
    </div>
    <div className={`${TEXT.heading} text-[15px] font-semibold font-mono truncate`}>
      {value}
    </div>
    {sublabel && (
      <div className={`${TEXT.muted} ${TYPOGRAPHY_CLASSES.settingsHelper} mt-0.5 truncate`}>
        {sublabel}
      </div>
    )}
  </div>
);

export default UsagePanel;
