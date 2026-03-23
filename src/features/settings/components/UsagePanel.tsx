/**
 * UsagePanel Component
 *
 * Displays token usage and estimated costs across all AI operations.
 * Read-only panel — no save footer needed.
 */

import React from 'react';
import { DollarSign, Zap, TrendingUp, Loader2 } from 'lucide-react';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS, LAYOUT } from '@config/theme.config';
import { SettingsSection } from './shared';
import { useUsageData } from '../hooks/useUsageData';
import type { TimeRange } from '../hooks/useUsageData';
import { formatTokenCount, formatCost, formatCategory } from '@extensions/usage/format';

const TIME_RANGE_OPTIONS: { id: TimeRange; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

export const UsagePanel: React.FC = () => {
  const { summary, isLoading, timeRange, setTimeRange } = useUsageData();

  const topModel = summary?.by_provider_model?.[0];

  return (
    <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-8`}>
      {/* Header */}
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
          Usage
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Token usage and estimated costs across all AI operations.
        </p>
      </div>

      {/* Time Range Filter */}
      <div className={`inline-flex ${RADIUS.lg} border ${BORDER.default} overflow-hidden`}>
        {TIME_RANGE_OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTimeRange(id)}
            className={`px-3 py-1.5 ${TYPOGRAPHY_CLASSES.settingsButton} transition-colors ${
              timeRange === id
                ? `${SURFACE.selectedCard} ${TEXT.heading}`
                : `${TEXT.muted} ${SURFACE.hoverSubtle}`
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className={`w-5 h-5 ${TEXT.muted} animate-spin`} />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && summary && summary.total_calls === 0 && (
        <div className={`text-center py-12 ${TEXT.muted} ${TYPOGRAPHY_CLASSES.settingsDescription}`}>
          No usage data yet. Start a chat or transcribe a recording to see usage here.
        </div>
      )}

      {/* Content */}
      {!isLoading && summary && summary.total_calls > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Estimated Cost"
              value={formatCost(summary.total_cost)}
            />
            <SummaryCard
              icon={<Zap className="w-4 h-4" />}
              label="Tokens"
              value={`${formatTokenCount(summary.total_input_tokens)} in / ${formatTokenCount(summary.total_output_tokens)} out`}
            />
            <SummaryCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Top Model"
              value={topModel ? topModel.model : '—'}
              sublabel={topModel ? `${topModel.calls} calls · ${formatCost(topModel.estimated_cost)}` : undefined}
            />
          </div>

          {/* By Provider/Model */}
          <SettingsSection title="By Model">
            <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} overflow-hidden`}>
              {/* Table header */}
              <div className={`grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b ${BORDER.divide} ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} uppercase tracking-wider`}>
                <span>Provider</span>
                <span>Model</span>
                <span className="text-right w-14">Calls</span>
                <span className="text-right w-20">Input</span>
                <span className="text-right w-20">Output</span>
                <span className="text-right w-20">Cost</span>
              </div>
              {/* Table rows */}
              {summary.by_provider_model.map((row) => (
                <div
                  key={`${row.provider}-${row.model}`}
                  className={`grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2.5 border-b last:border-b-0 ${BORDER.divide} ${TYPOGRAPHY_CLASSES.settingsInput}`}
                >
                  <span className={`${TEXT.secondary} capitalize truncate`}>{row.provider}</span>
                  <span className={`${TEXT.heading} ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono truncate`}>{row.model}</span>
                  <span className={`${TEXT.muted} text-right ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono w-14`}>{row.calls}</span>
                  <span className={`${TEXT.muted} text-right ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono w-20`}>{formatTokenCount(row.input_tokens)}</span>
                  <span className={`${TEXT.muted} text-right ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono w-20`}>{formatTokenCount(row.output_tokens)}</span>
                  <span className={`${TEXT.heading} text-right ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono w-20`}>{formatCost(row.estimated_cost)}</span>
                </div>
              ))}
              {/* Totals row */}
              <div className={`grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2.5 ${SURFACE.subtle} ${TYPOGRAPHY_CLASSES.settingsInputLabel}`}>
                <span className={TEXT.heading}>Total</span>
                <span />
                <span className={`${TEXT.heading} text-right ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono w-14`}>{summary.total_calls}</span>
                <span className={`${TEXT.heading} text-right ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono w-20`}>{formatTokenCount(summary.total_input_tokens)}</span>
                <span className={`${TEXT.heading} text-right ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono w-20`}>{formatTokenCount(summary.total_output_tokens)}</span>
                <span className={`${TEXT.heading} text-right ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono w-20`}>{formatCost(summary.total_cost)}</span>
              </div>
            </div>
          </SettingsSection>

          {/* By Category */}
          {summary.by_category.length > 0 && (
            <SettingsSection title="By Category">
              <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} divide-y ${BORDER.divide}`}>
                {summary.by_category.map((cat) => (
                  <div key={cat.category} className={`flex items-center justify-between px-4 py-2.5 ${TYPOGRAPHY_CLASSES.settingsInput}`}>
                    <div className="flex items-center gap-3">
                      <span className={`${TEXT.heading} font-medium`}>{formatCategory(cat.category)}</span>
                      <span className={`${TEXT.faint} ${TYPOGRAPHY_CLASSES.settingsHelper}`}>{cat.calls} call{cat.calls !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`${TEXT.muted} ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono`}>
                        {formatTokenCount(cat.input_tokens)} in / {formatTokenCount(cat.output_tokens)} out
                      </span>
                      <span className={`${TEXT.heading} ${TYPOGRAPHY_CLASSES.settingsHelper} font-mono min-w-[4rem] text-right`}>
                        {formatCost(cat.estimated_cost)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SettingsSection>
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
  <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} p-4`}>
    <div className={`flex items-center gap-1.5 ${TEXT.faint} mb-2`}>
      {icon}
      <span className={TYPOGRAPHY_CLASSES.settingsHelper}>{label}</span>
    </div>
    <div className={`${TEXT.heading} ${TYPOGRAPHY_CLASSES.settingsTitle} font-mono truncate`}>
      {value}
    </div>
    {sublabel && (
      <div className={`${TEXT.muted} ${TYPOGRAPHY_CLASSES.settingsHelper} mt-1 truncate`}>
        {sublabel}
      </div>
    )}
  </div>
);

export default UsagePanel;
