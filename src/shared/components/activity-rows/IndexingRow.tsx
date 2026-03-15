/**
 * IndexingRow — renders an indexing-type activity in the tray.
 * Shows spinner, label, step counter, progress bar, current meeting title.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ProgressBar } from './ProgressBar';

const css = {
  heading: { color: 'var(--text-primary)' },
  muted: { color: 'var(--text-muted)' },
  faint: { color: 'var(--text-faint)' },
} as const;

export const IndexingRow: React.FC<{ item: ActivityItem }> = ({ item }) => (
  <div className="px-3 py-2.5 space-y-1.5">
    {/* Header: spinner + label + step counter */}
    <div className="flex items-center gap-2">
      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={{ color: '#3b82f6' }} />
      <span className="text-xs font-medium truncate flex-1" style={css.heading}>
        {item.label}
      </span>
      {item.step && (
        <span className="text-xs shrink-0" style={css.muted}>
          {item.step.current}/{item.step.total}
        </span>
      )}
    </div>

    {/* Progress bar */}
    {item.percent !== null && <ProgressBar percent={item.percent} />}

    {/* Current meeting title detail */}
    {item.detail && (
      <p className="text-[10px] truncate" style={css.faint}>
        {item.detail}
      </p>
    )}
  </div>
);
