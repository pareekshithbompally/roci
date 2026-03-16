/**
 * DownloadRow — renders a download-type activity in the tray.
 *
 * Uses ActivityRowLayout for consistent single-line display.
 * Byte detail and percent are merged into the detail string on line 1.
 */

import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ActivityRowLayout } from './ActivityRowLayout';

export const DownloadRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  const isIndeterminate = item.percent === null;

  // Merge byte detail + percent into one compact string
  const detailParts: string[] = [];
  if (item.detail) detailParts.push(item.detail);
  if (item.percent !== null) detailParts.push(`${item.percent}%`);
  const mergedDetail = detailParts.join(' · ') || null;

  const icon = isIndeterminate ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#3b82f6' }} />
  ) : (
    <Download className="w-3.5 h-3.5" style={{ color: '#3b82f6' }} />
  );

  return (
    <ActivityRowLayout
      icon={icon}
      label={item.label}
      detail={mergedDetail}
      actions={item.actions}
      percent={item.percent}
    />
  );
};
