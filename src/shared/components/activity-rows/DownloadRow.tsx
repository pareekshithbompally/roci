/**
 * DownloadRow — renders a download-type activity in the tray.
 * Shows download icon, label, percent, progress bar, byte detail, cancel.
 */

import React from 'react';
import { Download, Loader2, X } from 'lucide-react';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ProgressBar } from './ProgressBar';

const css = {
  heading: { color: 'var(--text-primary)' },
  muted: { color: 'var(--text-muted)' },
  faint: { color: 'var(--text-faint)' },
  link: { color: '#3b82f6' },
} as const;

export const DownloadRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  const cancelAction = item.actions.find((a) => a.icon === 'x');
  const isIndeterminate = item.percent === null;

  return (
    <div className="px-3 py-2.5 space-y-1.5">
      {/* Header: icon + label + percent */}
      <div className="flex items-center gap-2">
        {isIndeterminate ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={css.link} />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0" style={css.link} />
        )}
        <span className="text-xs font-medium truncate flex-1" style={css.heading}>
          {item.label}
        </span>
        {item.percent !== null && (
          <span className="text-xs font-medium shrink-0" style={css.muted}>
            {item.percent}%
          </span>
        )}
        {cancelAction && (
          <button
            onClick={cancelAction.onClick}
            className="p-1 rounded-md transition-colors hover:opacity-80"
            style={css.faint}
            title={cancelAction.label}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <ProgressBar percent={item.percent} />

      {/* Byte detail */}
      {item.detail && (
        <p className="text-[10px]" style={css.faint}>
          {item.detail}
        </p>
      )}
    </div>
  );
};
