/** An indexing activity in the tray; step counter and percent merged into the detail. */

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ActivityRowLayout, formatStep } from './ActivityRowLayout';

export const IndexingRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  // Merge step counter + percent into one compact string
  const detailParts: string[] = [];
  const step = formatStep(item.step);
  if (step) detailParts.push(step);
  if (item.percent !== null) detailParts.push(`${item.percent}%`);
  const mergedDetail = detailParts.join(' · ') || null;

  return (
    <ActivityRowLayout
      icon={<Loader2 className="w-3.5 h-3.5 animate-spin text-info" />}
      label={item.label}
      detail={mergedDetail}
      actions={item.actions}
      percent={item.percent}
    />
  );
};
