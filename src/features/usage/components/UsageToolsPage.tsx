/** The tools the AI called in the period on screen: how often, how often they failed, how long they took, when last. */

import React from 'react';
import { Icon, Section, Text, type DataColumn } from '@shared/ui';
import { RecordList, ScreenState } from '@shared/components';
import { SettingsPage } from '@features/settings/components/shared';
import { USAGE_CONFIG } from '@config/usage.config';
import type { ToolBreakdown } from '@extensions/usage';
import { formatRelativeTime } from '@shared/utils/formatters';
import { toolCallIcon } from '@features/chat';
import { toolName } from '@features/usage/model/series';
import { formatMeasure, formatMs } from '@features/usage/model/format';
import { useUsageWindow } from '@features/usage/hooks/useUsageQueries';
import { useUsageOffset, useUsagePeriod } from '@features/usage/stores/usageStore';

const COPY = USAGE_CONFIG.copy;
const COL = COPY.columns;

const figure = (text: string) => <Text variant="figure">{text}</Text>;

const TOOL_COLUMNS: ReadonlyArray<DataColumn<ToolBreakdown>> = [
  {
    key: 'tool',
    header: COL.tool,
    sortValue: (t) => toolName(t.tool),
    cell: (t) => (
      <div className="flex min-w-0 items-center gap-2">
        <Icon icon={toolCallIcon(t.tool)} size="sm" />
        <Text truncate>{toolName(t.tool)}</Text>
      </div>
    ),
  },
  { key: 'calls', header: COL.calls, align: 'end', sortValue: (t) => t.calls, cell: (t) => figure(formatMeasure('requests', t.calls)) },
  { key: 'failed', header: COL.failed, align: 'end', sortValue: (t) => t.failed, cell: (t) => figure(formatMeasure('requests', t.failed)) },
  { key: 'time', header: COL.time, align: 'end', sortValue: (t) => t.avg_ms ?? -1, cell: (t) => figure(t.avg_ms === null ? '—' : formatMs(t.avg_ms)) },
  { key: 'last', header: COL.lastUsed, align: 'end', sortValue: (t) => t.last_used, cell: (t) => <Text tone="muted">{formatRelativeTime(t.last_used)}</Text> },
];

export const UsageToolsPage: React.FC<{ title: string; onBack?: () => void }> = ({ title, onBack }) => {
  const { summary, isLoading, error } = useUsageWindow(useUsagePeriod(), useUsageOffset());
  return (
    <SettingsPage title={title} onBack={onBack}>
      <ScreenState loading={isLoading} error={error ? { cause: error, title: COPY.loadFailed } : null} className="flex flex-col gap-section">
        {summary && (
          <Section layout="stack">
            <RecordList
              columns={TOOL_COLUMNS}
              rows={summary.by_tool}
              rowKey={(t) => t.tool}
              label={COPY.toolsLabel}
              search={{ placeholder: COPY.search.tools, text: (t) => toolName(t.tool) }}
              sort={{ key: 'calls', desc: true }}
              empty={summary.by_tool.length === 0 ? COPY.noTools : COPY.noMatches}
              phoneRow={(t) => ({
                title: toolName(t.tool),
                description: formatRelativeTime(t.last_used),
                leading: <Icon icon={toolCallIcon(t.tool)} size="sm" />,
                value: COPY.calls(formatMeasure('requests', t.calls), t.calls),
              })}
            />
          </Section>
        )}
      </ScreenState>
    </SettingsPage>
  );
};
