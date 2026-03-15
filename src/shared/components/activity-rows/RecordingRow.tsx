/**
 * RecordingRow — renders a recording-type activity in the tray.
 *
 * Handles all recording states:
 * - Recording/paused: status dot, timer, pause/resume/stop controls
 * - Review: compact row with expand, process/later/discard actions
 *
 * Controls are wired via the actions array on ActivityItem.
 */

import React from 'react';
import { Pause, Play, Square, Trash2, Timer, Sparkles, X } from 'lucide-react';
import type { ActivityItem } from '@shared/stores/activityStore';

const css = {
  heading: { color: 'var(--text-primary)' },
  muted: { color: 'var(--text-muted)' },
  faint: { color: 'var(--text-faint)' },
} as const;

export const RecordingRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  const isPaused = item.actions.some((a) => a.icon === 'play');

  return (
    <div className="px-3 py-2.5 space-y-1.5">
      {/* Header: dot + label + timer */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'
          }`}
        />
        <span className="text-xs font-medium truncate flex-1" style={css.heading}>
          {item.label}
        </span>
        {item.detail && (
          <span className="text-xs font-mono shrink-0" style={css.muted}>
            {item.detail}
          </span>
        )}
      </div>

      {/* Stall warning */}
      {item.error && (
        <p className="text-[10px] px-2 py-1 rounded bg-amber-500/10" style={{ color: '#f59e0b' }}>
          {item.error}
        </p>
      )}

      {/* Action buttons */}
      {item.actions.length > 0 && (
        <div className="flex items-center gap-1.5 justify-end">
          {item.actions.map((action) => (
            <button
              key={action.icon}
              onClick={action.onClick}
              className="p-1.5 rounded-md transition-colors hover:opacity-80"
              style={{ color: action.icon === 'square' ? '#ef4444' : 'var(--text-faint)' }}
              title={action.label}
            >
              <ActionIcon name={action.icon} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ActionIcon: React.FC<{ name: string }> = ({ name }) => {
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
