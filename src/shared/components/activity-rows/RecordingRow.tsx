/** A recording in the tray: recording, paused, or just saved (offering Transcribe). */

import React from 'react';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ActivityRowLayout } from './ActivityRowLayout';

export const RecordingRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  const isPaused = item.actions.some((a) => a.icon === 'play');
  const isSaved = !item.actions.some((a) => a.icon === 'square' || a.icon === 'play');

  const dot = (
    <div
      className={`w-2.5 h-2.5 rounded-full ${
        isSaved
          ? 'bg-info'
          : isPaused
            ? 'bg-warning'
            : 'bg-danger animate-pulse'
      }`}
    />
  );

  return (
    <ActivityRowLayout
      icon={dot}
      label={item.label}
      detail={item.detail}
      actions={item.actions}
      percent={item.percent}
    />
  );
};
