/** What each colour in a chart or graph stands for: one swatch and name per series or kind, wrapping as room allows. */

import { cn } from './utils';
import { Text } from './text';
import { Swatch } from './swatch';

export interface ChartLegendItem {
  /** Its colour token (`--viz-1` …). */
  token: string;
  label: string;
}

export function ChartLegend({ items, className }: { items: readonly ChartLegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {items.map(({ token, label }, i) => (
        <li key={`${i}-${label}`} className="flex items-center gap-1.5">
          <Swatch token={token} />
          <Text variant="caption" tone="muted">{label}</Text>
        </li>
      ))}
    </ul>
  );
}
