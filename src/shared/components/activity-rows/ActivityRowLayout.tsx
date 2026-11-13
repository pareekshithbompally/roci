/**
 * ActivityRowLayout — shared two-line layout for all ActivityTray rows.
 *
 * Anatomy:
 *   Line 1: [icon]  label  [badge]
 *   Line 2:         detail text    [action buttons]
 *   Line 3: optional thin progress bar (only when percent != null)
 *
 * Splitting label and detail onto separate lines prevents truncation in the
 * narrow sidebar where a single-line layout cannot fit all three elements.
 */

import React from 'react';
import { Pause, Play, Square, Trash2, Timer, Sparkles, X } from 'lucide-react';
import type { ActivityAction } from '@shared/stores/activityStore';
import { ProgressBar } from './ProgressBar';

interface ActivityRowLayoutProps {
  /** Leading icon (colored dot, spinner, etc.) */
  icon: React.ReactNode;
  /** Primary label — truncates in the middle */
  label: string;
  /** Optional inline badge between label and detail (e.g. stall warning) */
  badge?: React.ReactNode;
  /** Right-aligned detail text (timer, byte count, etc.) */
  detail?: string | null;
  /** Action buttons rendered inline right as icon-only buttons */
  actions: ActivityAction[];
  /** Progress percentage — renders thin bar below when not null */
  percent?: number | null;
}

export const ActivityRowLayout: React.FC<ActivityRowLayoutProps> = ({
  icon,
  label,
  badge,
  detail,
  actions,
  percent,
}) => (
  <div className="px-3 py-2.5 space-y-1">
    {/* Line 1: icon + label + badge.
        Actions sit here only when there is no detail line (e.g. Extracting, Validating). */}
    <div className="flex items-center gap-2 min-w-0">
      <div className="shrink-0">{icon}</div>
      <span
        className="text-xs font-medium truncate flex-1 min-w-0"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </span>
      {badge}
      {!detail && actions.length > 0 && (
        <div className="flex items-center gap-0.5 shrink-0">
          {actions.map((action) => (
            <button
              key={action.icon}
              onClick={action.onClick}
              className="p-1 rounded-md transition-colors hover:opacity-80"
              style={{ color: actionColor(action.icon) }}
              title={action.label}
            >
              <ActionIcon name={action.icon} />
            </button>
          ))}
        </div>
      )}
    </div>

    {/* Line 2: detail + actions — only rendered when detail text exists. */}
    {detail && (
      <div className="flex items-center gap-1.5 min-w-0 pl-[22px]">
        <span
          className="text-[11px] font-mono flex-1 min-w-0 truncate"
          style={{ color: 'var(--text-muted)' }}
        >
          {detail}
        </span>
        {actions.length > 0 && (
          <div className="flex items-center gap-0.5 shrink-0 ml-auto">
            {actions.map((action) => (
              <button
                key={action.icon}
                onClick={action.onClick}
                className="p-1 rounded-md transition-colors hover:opacity-80"
                style={{ color: actionColor(action.icon) }}
                title={action.label}
              >
                <ActionIcon name={action.icon} />
              </button>
            ))}
          </div>
        )}
      </div>
    )}

    {/* Line 3: progress bar */}
    {percent != null && <ProgressBar percent={percent} />}
  </div>
);

/** Map icon name to a contextual color */
function actionColor(icon: string): string {
  switch (icon) {
    case 'square':
      return '#ef4444'; // red — stop
    case 'x':
      return 'var(--text-faint)'; // cancel
    case 'sparkles':
      return '#a855f7'; // purple — summarize
    default:
      return 'var(--text-faint)';
  }
}

/** Render a lucide icon by name */
export const ActionIcon: React.FC<{ name: string }> = ({ name }) => {
  const cls = 'w-3.5 h-3.5';
  switch (name) {
    case 'pause':
      return <Pause className={cls} />;
    case 'play':
      return <Play className={`${cls} fill-current`} />;
    case 'square':
      return <Square className={`${cls} fill-current`} />;
    case 'trash-2':
      return <Trash2 className={cls} />;
    case 'timer':
      return <Timer className={cls} />;
    case 'sparkles':
      return <Sparkles className={cls} />;
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
