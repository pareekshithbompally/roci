/** A chart `show` drew: the kit chart in its card, a line above it reading the point under the pointer (else the latest),
 *  a legend when it holds more than one series, and its source under it. */

import React, { useMemo, useState } from 'react';
import { Chart, Section, Swatch, Text, type ChartOption } from '@shared/ui';
import { formatFigure } from '@shared/utils/formatters';
import { UI_CONFIG } from '@config/ui.config';
import { RESULT_VIEWS_CONFIG } from '@config/resultViews.config';
import type { ResultView } from '@core/ai';
import { SourceLine } from './SourceLine';

type ChartViewModel = Extract<ResultView, { kind: 'chart' }>;

const C = UI_CONFIG.chart;

/** Series colour slots are 1-based tokens (`--viz-1` …), in the order the theme gives them. */
const seriesToken = (index: number) => `--viz-${index + 1}`;

function chartOption(view: ChartViewModel): ChartOption {
  const type = view.chartType === 'bar' ? 'bar' : 'line';
  const fill = view.chartType === 'area' ? { areaStyle: { opacity: C.areaOpacity } } : {};
  return {
    grid: { left: C.inset, right: C.inset, top: C.inset, bottom: C.inset, containLabel: true },
    tooltip: { trigger: 'axis', showContent: false },
    xAxis: { type: 'category', data: view.labels, boundaryGap: type === 'bar' },
    // A trend reads from its own range; bars compare against zero.
    yAxis: { type: 'value', splitNumber: 3, scale: type === 'line', axisLabel: { formatter: (v: number) => formatFigure(v, view.unit) } },
    series: view.series.map((s) => ({ type, name: s.name, data: s.values, ...fill })),
  };
}

/** "Nov 20 · NVDA 125.53 USD · AMD 140.2 USD": the label, then each series' value there. */
function readout(view: ChartViewModel, index: number): string {
  const values = view.series.map((s) => `${s.name} ${formatFigure(s.values[index], view.unit)}`);
  return [view.labels[index], ...values].join(' · ');
}

const Legend: React.FC<{ names: string[] }> = ({ names }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
    {names.map((name, i) => (
      <div key={`${i}-${name}`} className="flex items-center gap-1.5">
        <Swatch token={seriesToken(i)} />
        <Text variant="caption" tone="muted">{name}</Text>
      </div>
    ))}
  </div>
);

export const ChartView: React.FC<{ view: ChartViewModel }> = ({ view }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const option = useMemo(() => chartOption(view), [view]);
  const shown = hovered ?? view.labels.length - 1;
  return (
    <Section title={view.title} footer={<SourceLine source={view.source} />}>
      <div className="flex flex-col gap-1 py-3">
        <Text variant="figure" tone={hovered === null ? 'muted' : 'primary'}>{readout(view, shown)}</Text>
        <Chart option={option} height={RESULT_VIEWS_CONFIG.chartHeight} label={view.title} onHover={setHovered} />
        {view.series.length > 1 && <Legend names={view.series.map((s) => s.name)} />}
      </div>
    </Section>
  );
};
