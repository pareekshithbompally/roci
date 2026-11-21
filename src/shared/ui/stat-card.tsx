/** A KPI card: what it counts, the figure large, and one line under it (a change, a note), on the grouped card surface. */

import React from 'react';
import { cn } from './utils';
import { Text } from './text';
import { GROUPED_SURFACE } from './recipes';

export interface StatCardProps {
  label: string;
  value: string;
  detail?: React.ReactNode;
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 p-4', GROUPED_SURFACE)}>
      <Text variant="caption" tone="muted">{label}</Text>
      <Text variant="display" className="tabular-nums" truncate>{value}</Text>
      {detail && <Text variant="caption" tone="muted">{detail}</Text>}
    </div>
  );
}
