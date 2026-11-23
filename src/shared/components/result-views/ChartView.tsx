/** A chart `show` drew: the kit chart in its card, a line above it reading the point under the pointer (else the latest),
 *  a legend when it holds more than one series, and its source under it. */

import React, { useMemo, useState } from 'react';
import { Chart, ChartLegend, Section, Text, axisChart, type ChartOption } from '@shared/ui';
import { formatFigure } from '@shared/utils/formatters';
import { UI_CONFIG } from '@config/ui.config';
import { RESULT_VIEWS_CONFIG } from '@config/resultViews.config';
import type { ResultView } from '@core/ai';
import { SourceLine } from './SourceLine';

type ChartViewModel = Extract<ResultView, { kind: 'chart' }>;

/** Series colour slots are 1-based tokens (`--viz-1` …), in the order the theme gives them. */
const seriesToken = (index: number) => `--viz-${index + 1}`;

function chartOption(view: ChartViewModel): ChartOption {
  const type = view.chartType === 'bar' ? 'bar' : 'line';
  const fill = view.chartType === 'area' ? { areaStyle: { opacity: UI_CONFIG.chart.areaOpacity } } : {};
  return axisChart({
    categories: view.labels,
    series: view.series.map((s) => ({ type, name: s.name, data: s.values, ...fill })),
    formatValue: (v) => formatFigure(v, view.unit),
    // A line reads from its own range; bars and areas measure from zero.
    fromZero: view.chartType !== 'line',
  });
}

/** "Nov 20 · NVDA 125.53 USD · AMD 140.2 USD": the label, then each series' value there. */
function readout(view: ChartViewModel, index: number): string {
  const values = view.series.map((s) => `${s.name} ${formatFigure(s.values[index], view.unit)}`);
  return [view.labels[index], ...values].join(' · ');
}

export const ChartView: React.FC<{ view: ChartViewModel }> = ({ view }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const option = useMemo(() => chartOption(view), [view]);
  const legend = useMemo(() => view.series.map((s, i) => ({ token: seriesToken(i), label: s.name })), [view.series]);
  const shown = hovered ?? view.labels.length - 1;
  return (
    <Section flush title={view.title} footer={<SourceLine source={view.source} />}>
      <div className="flex flex-col gap-1 py-3">
        <Text variant="figure" tone={hovered === null ? 'muted' : 'primary'}>{readout(view, shown)}</Text>
        <Chart option={option} height={RESULT_VIEWS_CONFIG.chartHeight} label={view.title} onHover={setHovered} />
        {view.series.length > 1 && <ChartLegend items={legend} />}
      </div>
    </Section>
  );
};
