/**
 * RecordingRow — renders a recording-type activity in the tray.
 *
 * Handles all recording states via the shared ActivityRowLayout:
 * - Recording: red pulsing dot, pause/stop actions
 * - Paused: amber dot, resume/stop actions
 * - Review: neutral dot, summarize/later/discard actions
 *
 * Stall warning renders as an inline badge, not its own line.
 */

import React from 'react';
import { Badge } from '@shared/ui';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ActivityRowLayout } from './ActivityRowLayout';

export const RecordingRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  const isPaused = item.actions.some((a) => a.icon === 'play');
  const isReview = item.label.toLowerCase().includes('review');

  const dot = (
    <div
      className={`w-2.5 h-2.5 rounded-full ${
        isReview
          ? 'bg-info'
          : isPaused
            ? 'bg-warning'
            : 'bg-danger animate-pulse'
      }`}
    />
  );

  const stallBadge = item.error ? <Badge variant="warning">stall</Badge> : undefined;

  return (
    <ActivityRowLayout
      icon={dot}
      label={item.label}
      badge={stallBadge}
      detail={item.detail}
      actions={item.actions}
      percent={item.percent}
    />
  );
};
