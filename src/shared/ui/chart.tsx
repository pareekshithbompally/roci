/** A chart: an Apache ECharts option drawn in the app's colours and type. The theme is built from the design tokens when
 *  the chart mounts and again when light or dark changes, so features pass data and series only, never a colour. */

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts';
import { AxisPointerComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import type { AxisPointerComponentOption, GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { UI_CONFIG } from '@config/ui.config';

const C = UI_CONFIG.chart;

echarts.use([BarChart, LineChart, PieChart, AxisPointerComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

export type ChartOption = echarts.ComposeOption<
  BarSeriesOption | LineSeriesOption | PieSeriesOption | AxisPointerComponentOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>;

/** Series colour slots in `tokens.css` (`--viz-1` …), in their fixed order. */
const SERIES_SLOTS = 8;
const THEME = 'roci';

/** ECharts' theme from the tokens as they are now: series colours, ink, hairlines, the tooltip's surface, and the app's type
 *  scale — axis labels at the caption size (as table headers), everything else at the helper size (as tooltips elsewhere). */
function tokenTheme(): object {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const { fontFamily } = getComputedStyle(document.body);
  const caption = { fontFamily, fontSize: parseFloat(token('--fs-subheadline')) };
  const helper = { fontFamily, fontSize: parseFloat(token('--fs-callout')) };
  const ink = token('--text-primary');
  const muted = token('--text-muted');
  const hairline = token('--border-muted');
  const axis = {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: muted, ...caption },
    nameTextStyle: { color: muted, ...caption },
    splitLine: { lineStyle: { color: hairline } },
  };
  return {
    color: Array.from({ length: SERIES_SLOTS }, (_, i) => token(`--viz-${i + 1}`)),
    backgroundColor: 'transparent',
    textStyle: { color: ink, ...helper },
    categoryAxis: { ...axis, splitLine: { show: false } },
    valueAxis: axis,
    legend: { textStyle: { color: muted, ...caption }, icon: 'circle' },
    tooltip: { backgroundColor: token('--bg-layer-1'), borderColor: token('--border-base'), textStyle: { color: ink, ...helper } },
    // Marks: thin bars with rounded data ends; slices parted by a gap in the card's own colour.
    bar: { barMaxWidth: C.barMaxWidth, itemStyle: { borderRadius: [C.barRadius, C.barRadius, 0, 0] } },
    pie: { itemStyle: { borderColor: token('--bg-grouped-card'), borderWidth: C.sliceGap } },
  };
}

export interface ChartProps {
  option: ChartOption;
  /** Plot height in px (from config). */
  height: number;
  /** What the chart shows, for assistive tech. */
  label: string;
}

export function Chart({ option, height, label }: ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const { isDark } = useThemeContext();

  // A new theme needs a new instance: built on mount and on each light/dark change, sized with its box.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    echarts.registerTheme(THEME, tokenTheme());
    const instance = echarts.init(el, THEME, { renderer: 'svg' });
    chart.current = instance;
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(el);
    return () => {
      resize.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, [isDark]);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option, isDark]);

  return <div ref={host} role="img" aria-label={label} className="w-full" style={{ height }} />;
}
