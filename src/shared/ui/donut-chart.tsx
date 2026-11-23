/** A donut with its total in the middle and its legend as native rows beside it (under it when the row has no room): the
 *  largest entries by name, the rest as one "+N more" row whose native tooltip lists each of them. The ring and the legend
 *  highlight each other on hover. ECharts draws the ring only; every word and figure is kit text. */

import React, { useMemo, useState } from 'react';
import { UI_CONFIG } from '@config/ui.config';
import { useFormFactor } from '@platform/formFactor';
import { KIT_COPY } from '@config/kitCopy.config';
import { rowClasses } from './row';
import { Chart, type ChartOption } from './chart';
import { cssToken } from './utils';
import { Swatch } from './swatch';
import { Text } from './text';
import { Tooltip } from './tooltip';

export interface DonutSlice {
  key: string;
  label: string;
  /** An icon before the name (a model's, a provider's, a use case's). */
  leading?: React.ReactNode;
  value: number;
  /** The value as it reads ("$0.07", "No price", "128"). */
  valueText: string;
  /** Its series colour (`--viz-N`), fixed to what it stands for so it keeps it when the view changes; none: neutral. */
  slot?: number;
}

export interface DonutChartProps {
  /** Largest first; past `UI_CONFIG.chart.maxSlices` the rest fold into "+N more". */
  slices: readonly DonutSlice[];
  /** The whole, in the hole: its figure and what it counts ("$0.08", "Cost"). */
  total: { value: string; caption: string };
  /** A sum of values as it reads, for the "+N more" row. */
  formatValue: (value: number) => string;
  /** What the chart shows, for assistive tech. */
  label: string;
}

const C = UI_CONFIG.chart;
const PERCENT = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });
/** The neutral colour of "+N more": never a series colour. */
const REST = '--text-faint';

/** A row's colour token: its entity's series slot; "+N more" and slot-less rows are neutral. */
const colourOf = (row: Row): string => (row.members || !row.slot ? REST : `--viz-${row.slot}`);

/** "42%", or "<1%" for a sliver that would round to nothing. */
const shareText = (share: number) => (share > 0 && share < 0.01 ? KIT_COPY.sliver : PERCENT.format(share));

interface Row extends DonutSlice {
  /** The entries a "+N more" row stands for, one per line (its native tooltip). */
  members?: string;
}

/** The named rows, and past `C.maxSlices` (unless `nameAll`) one "+N more" row for the rest. */
function rowsOf(slices: readonly DonutSlice[], formatValue: (v: number) => string, nameAll: boolean): Row[] {
  if (nameAll || slices.length <= C.maxSlices) return [...slices];
  const named = slices.slice(0, C.maxSlices - 1);
  const rest = slices.slice(C.maxSlices - 1);
  const value = rest.reduce((sum, s) => sum + s.value, 0);
  return [
    ...named,
    { key: 'more', label: KIT_COPY.moreCount(rest.length), value, valueText: formatValue(value), members: rest.map((s) => `${s.label} — ${s.valueText}`).join('\n') },
  ];
}

interface LegendRowProps {
  row: Row;
  /** Its colour token. */
  swatch: string;
  share: string;
  active: boolean;
  onHover: (on: boolean) => void;
}

const LegendRow: React.FC<LegendRowProps> = ({ row, swatch, share, active, onHover }) => (
  <Tooltip content={row.members ?? `${row.label} — ${row.valueText}`}>
    <li
      className={rowClasses(active)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <Swatch token={swatch} />
      {row.leading}
      <Text truncate tone={row.members ? 'muted' : 'primary'} className="min-w-0 flex-1">{row.label}</Text>
      <Text variant="figure">{row.valueText}</Text>
      <Text variant="figure" tone="muted" className="w-10 text-right">{share}</Text>
    </li>
  </Tooltip>
);

export function DonutChart({ slices, total, formatValue, label }: DonutChartProps) {
  // On touch every entry is named: a folded "+N more" lists its members only on hover.
  const nameAll = useFormFactor() === 'phone';
  const [hovered, setHovered] = useState<number | null>(null);
  const rows = useMemo(() => rowsOf(slices, formatValue, nameAll), [slices, formatValue, nameAll]);
  const sum = rows.reduce((s, r) => s + r.value, 0);
  const option = useMemo<ChartOption>(() => ({
    series: [{
      type: 'pie',
      radius: ['64%', '92%'],
      label: { show: false },
      data: rows.map((r) => ({ name: r.label, value: r.value, itemStyle: { color: cssToken(colourOf(r)) } })),
    }],
  }), [rows]);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: C.donutHeight }}>
        <Chart option={option} height={C.donutHeight} label={label} onHover={setHovered} highlight={hovered} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <Text variant="title" className="tabular-nums">{total.value}</Text>
          <Text variant="caption" tone="muted">{total.caption}</Text>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 basis-56 flex-col">
        {rows.map((r, i) => (
          <LegendRow
            key={r.key}
            row={r}
            swatch={colourOf(r)}
            share={shareText(sum ? r.value / sum : 0)}
            active={hovered === i}
            onHover={(on) => setHovered(on ? i : null)}
          />
        ))}
      </ul>
    </div>
  );
}
