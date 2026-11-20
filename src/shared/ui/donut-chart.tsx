/** A donut and its legend: ECharts draws the ring; the legend is native rows (swatch, icon, name, value, share) in the app's
 *  type, so every figure reads exactly as the caller formatted it, in the tooltip too. */

import React, { useMemo } from 'react';
import { format } from 'echarts/core';
import { UI_CONFIG } from '@config/ui.config';
import { Chart, type ChartOption } from './chart';
import { Text } from './text';

export interface DonutSlice {
  key: string;
  label: string;
  /** An icon before the name (a model's, a provider's, a use case's). */
  leading?: React.ReactNode;
  value: number;
  /** The value as it reads ("$0.07", "No price", "128"). */
  valueText: string;
}

export interface DonutChartProps {
  /** In palette order: slice `i` wears series colour `i + 1`; at most `UI_CONFIG.chart.maxSlices`. */
  slices: readonly DonutSlice[];
  /** A last legend line with no slice (what was left out, such as entries that cost nothing). */
  note?: DonutSlice;
  /** What the chart shows, for assistive tech. */
  label: string;
}

const C = UI_CONFIG.chart;
const PERCENT = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });

/** "42%", or "<1%" for a sliver that would round to nothing. */
const shareText = (share: number) => (share > 0 && share < 0.01 ? '<1%' : PERCENT.format(share));

const ROW = 'flex min-w-0 items-center gap-2 py-1';

/** One legend line: swatch (none for a note), icon, name, value, share. */
const LegendRow: React.FC<{ slice: DonutSlice; swatch?: string; share?: string }> = ({ slice, swatch, share }) => (
  <li className={ROW}>
    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={swatch ? { backgroundColor: swatch } : undefined} />
    {slice.leading}
    <Text truncate tone={swatch ? 'primary' : 'muted'} className="min-w-0 flex-1">{slice.label}</Text>
    <Text variant="figure" tone={swatch ? 'primary' : 'muted'}>{slice.valueText}</Text>
    <Text variant="figure" tone="muted" className="w-10 text-right">{share ?? ''}</Text>
  </li>
);

export function DonutChart({ slices, note, label }: DonutChartProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const option = useMemo<ChartOption>(() => ({
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const slice = slices[(p as { dataIndex: number }).dataIndex];
        return `${format.encodeHTML(slice.label)}<br/><b>${format.encodeHTML(slice.valueText)}</b> · ${shareText(total ? slice.value / total : 0)}`;
      },
    },
    series: [{ type: 'pie', radius: ['62%', '92%'], label: { show: false }, data: slices.map((s) => ({ name: s.label, value: s.value })) }],
  }), [slices, total]);

  return (
    <div className="flex flex-col gap-3">
      <Chart option={option} height={C.donutHeight} label={label} />
      <ul className="flex flex-col">
        {slices.map((s, i) => (
          <LegendRow key={s.key} slice={s} swatch={`var(--viz-${i + 1})`} share={shareText(total ? s.value / total : 0)} />
        ))}
        {note && <LegendRow slice={note} />}
        {/* Every slot keeps its row, so donuts side by side are the same height whatever they hold. */}
        {Array.from({ length: Math.max(0, C.maxSlices - slices.length - (note ? 1 : 0)) }, (_, i) => (
          <li key={`empty-${i}`} aria-hidden="true" className={ROW}><Text>&nbsp;</Text></li>
        ))}
      </ul>
    </div>
  );
}
