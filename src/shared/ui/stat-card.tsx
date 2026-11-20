/** A KPI card: what it counts, the figure large, and one line under it (a change, a note). */

import React from 'react';
import { Text } from './text';

export interface StatCardProps {
  label: string;
  value: string;
  detail?: React.ReactNode;
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card bg-grouped-card p-4">
      <Text variant="caption" tone="muted">{label}</Text>
      <Text variant="display" className="tabular-nums" truncate>{value}</Text>
      {detail && <Text variant="caption" tone="muted">{detail}</Text>}
    </div>
  );
}
