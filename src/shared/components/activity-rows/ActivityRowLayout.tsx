/** Two-line tray row (label line, detail line, optional progress bar) so nothing truncates in the narrow sidebar. */

import React from 'react';
import { Download, ExternalLink, Pause, Play, Square, Sparkles, RefreshCw, X } from 'lucide-react';
import type { ActivityAction } from '@shared/stores/activityStore';
import { Button, Progress, Text, cn } from '@shared/ui';

interface ActivityRowLayoutProps {
  /** Leading icon (colored dot, spinner, etc.) — sized to 14px */
  icon: React.ReactNode;
  /** Primary label — truncates */
  label: string;
  /** Optional inline badge after the label (e.g. stall warning) */
  badge?: React.ReactNode;
  /** Detail text on line 2 (timer, byte count, etc.) */
  detail?: string | null;
  /** Action buttons rendered inline right as icon-only buttons */
  actions: ActivityAction[];
  /** Progress percentage — renders thin bar below when not null */
  percent?: number | null;
}

export const ActivityRowLayout: React.FC<ActivityRowLayoutProps> = ({ icon, label, badge, detail, actions, percent }) => (
  <div className="px-3 py-2.5 space-y-1">
    {/* Line 1. Actions sit here only when there is no detail line (e.g. Extracting, Validating). */}
    <div className="flex items-center gap-2 min-w-0">
      <div className="shrink-0 w-3.5 flex justify-center">{icon}</div>
      <Text variant="label" truncate className="flex-1 min-w-0">{label}</Text>
      {badge}
      {!detail && <RowActions actions={actions} />}
    </div>

    {detail && (
      <div className="flex items-center gap-1.5 min-w-0 pl-5.5">
        <Text variant="caption" tone="muted" truncate className="font-mono flex-1 min-w-0">{detail}</Text>
        <RowActions actions={actions} />
      </div>
    )}

    {percent != null && <Progress percent={percent} />}
  </div>
);

const RowActions: React.FC<{ actions: ActivityAction[] }> = ({ actions }) =>
  actions.length === 0 ? null : (
    <div className="flex items-center gap-0.5 shrink-0 ml-auto">
      {actions.map((action) => (
        <Button
          key={action.icon}
          variant="ghost"
          size="iconXs"
          onClick={action.onClick}
          aria-label={action.label}
          title={action.label}
        >
          <ActionIcon name={action.icon} className={ACTION_TONE[action.icon]} />
        </Button>
      ))}
    </div>
  );

/** Contextual tone per action: stop is destructive, summarize is an AI moment. */
const ACTION_TONE: Record<string, string> = {
  square: 'text-danger',
  sparkles: 'text-ai',
};

/** Render a lucide icon by name */
const ActionIcon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  const cls = cn('w-3.5 h-3.5', className);
  switch (name) {
    case 'pause':
      return <Pause className={cls} />;
    case 'play':
      return <Play className={cn(cls, 'fill-current')} />;
    case 'square':
      return <Square className={cn(cls, 'fill-current')} />;
    case 'sparkles':
      return <Sparkles className={cls} />;
    case 'refresh-cw':
      return <RefreshCw className={cls} />;
    case 'download':
      return <Download className={cls} />;
    case 'external-link':
      return <ExternalLink className={cls} />;
    case 'x':
      return <X className={cls} />;
    default:
      return null;
  }
};

/** Compact "current/total" for an activity's step counter (shared by tray rows). */
export function formatStep(step: { current: number; total: number } | null): string | null {
  return step ? `${step.current}/${step.total}` : null;
}
