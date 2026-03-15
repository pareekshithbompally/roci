/**
 * ProcessingRow — renders a processing-type activity in the tray.
 * Shows spinner, label, and optional progress bar.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ProgressBar } from './ProgressBar';

const css = {
  heading: { color: 'var(--text-primary)' },
  muted: { color: 'var(--text-muted)' },
} as const;

export const ProcessingRow: React.FC<{ item: ActivityItem }> = ({ item }) => (
  <div className="px-3 py-2.5 space-y-1.5">
    {/* Header: spinner + label */}
    <div className="flex items-center gap-2">
      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={{ color: '#a855f7' }} />
      <span className="text-xs font-medium truncate flex-1" style={css.heading}>
        {item.label}
      </span>
      {item.detail && (
        <span className="text-[10px] shrink-0" style={css.muted}>
          {item.detail}
        </span>
      )}
    </div>

    {/* Progress bar (when percent is available) */}
    {item.percent !== null && <ProgressBar percent={item.percent} />}
  </div>
);
