/** A chart: Apache ECharts draws the marks only (bars, lines, rings), in the token colours; every word and figure around them is kit
 *  text. Hover goes out as an index (`onHover`) and highlight comes in as one (`highlight`), so a chart and its React parts
 *  (a header line, a legend) read as one thing. The theme is rebuilt from the tokens on mount and on each light/dark change. */

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts';
import { AxisPointerComponent, GridComponent, TooltipComponent } from 'echarts/components';
import type { AxisPointerComponentOption, GridComponentOption, TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { UI_CONFIG } from '@config/ui.config';
import { cssToken } from './utils';

const C = UI_CONFIG.chart;

// The tooltip component only drives the axis pointer; it never shows content (charts pass `showContent: false`).
echarts.use([BarChart, LineChart, PieChart, AxisPointerComponent, GridComponent, TooltipComponent, SVGRenderer]);

export type ChartOption = echarts.ComposeOption<
  BarSeriesOption | LineSeriesOption | PieSeriesOption | AxisPointerComponentOption | GridComponentOption | TooltipComponentOption
>;

const THEME = 'roci';

/** ECharts' theme from the tokens as they are now: series colours, axis labels in muted ink at the caption size (as table
 *  headers), hairlines, and the marks — thin bars with rounded data ends, plain lines, slices parted by a gap in the card's colour. */
function tokenTheme(): object {
  const token = cssToken;
  const { fontFamily } = getComputedStyle(document.body);
  const caption = { color: token('--text-muted'), fontFamily, fontSize: parseFloat(token('--fs-subheadline')) };
  const hairline = token('--border-muted');
  const axis = { axisLine: { show: false }, axisTick: { show: false }, axisLabel: caption, splitLine: { lineStyle: { color: hairline } } };
  return {
    color: Array.from({ length: C.seriesSlots }, (_, i) => token(`--viz-${i + 1}`)),
    // A chart arrives with its screen's fade, not by growing from zero; a value change morphs on the app's enter timing.
    animationDuration: 0,
    animationDurationUpdate: C.morphMs,
    backgroundColor: 'transparent',
    textStyle: caption,
    categoryAxis: { ...axis, splitLine: { show: false } },
    valueAxis: axis,
    tooltip: { axisPointer: { type: 'shadow', shadowStyle: { color: hairline } } },
    bar: { barMaxWidth: C.barMaxWidth, itemStyle: { borderRadius: [C.barRadius, C.barRadius, 0, 0] } },
    line: { symbol: 'none', lineStyle: { width: C.lineWidth } },
    pie: { itemStyle: { borderColor: token('--bg-grouped-card'), borderWidth: C.sliceGap }, emphasis: { focus: 'self', scaleSize: C.sliceGap * 2 }, blur: { itemStyle: { opacity: C.dimOpacity } } },
  };
}

/** A chart of values across categories (days, names) as every Roci trend and comparison draws one: inset plot, the axis
 *  pointer only (the line above the chart reads the point), a few value ticks. `fromZero: false` lets a trend's axis start
 *  near its own range; bars and areas always measure from zero. */
export function axisChart({ categories, series, formatValue, fromZero = true }: {
  categories: string[];
  series: Array<BarSeriesOption | LineSeriesOption>;
  formatValue: (value: number) => string;
  fromZero?: boolean;
}): ChartOption {
  const bars = series.some((s) => s.type === 'bar');
  return {
    grid: { left: C.inset, right: C.inset, top: C.inset, bottom: C.inset, containLabel: true },
    tooltip: { trigger: 'axis', showContent: false },
    xAxis: { type: 'category', data: categories, boundaryGap: bars },
    yAxis: { type: 'value', splitNumber: C.valueTicks, scale: !fromZero, axisLabel: { formatter: formatValue } },
    series,
  };
}

export interface ChartProps {
  option: ChartOption;
  /** Plot height in px (from config). */
  height: number;
  /** What the chart shows, for assistive tech. */
  label: string;
  /** The data index under the pointer (a bar's day, a slice), or null when it leaves. */
  onHover?: (index: number | null) => void;
  /** A data index to emphasise from outside (a legend row the pointer is on). */
  highlight?: number | null;
}

/** The data index an ECharts hover event points at: a slice's, or the category under an axis pointer. */
function hoveredIndex(event: { dataIndex?: number; axesInfo?: Array<{ value: number }> }): number | null {
  if (typeof event.dataIndex === 'number') return event.dataIndex;
  const value = event.axesInfo?.[0]?.value;
  return typeof value === 'number' ? value : null;
}

export function Chart({ option, height, label, onHover, highlight = null }: ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const hover = useRef(onHover);
  hover.current = onHover;
  const { isDark } = useThemeContext();

  // A new theme needs a new instance: built on mount and on each light/dark change, sized with its box, its hovers sent out.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    echarts.registerTheme(THEME, tokenTheme());
    const instance = echarts.init(el, THEME, { renderer: 'svg' });
    chart.current = instance;
    const report = (event: unknown) => hover.current?.(hoveredIndex(event as Parameters<typeof hoveredIndex>[0]));
    const leave = () => hover.current?.(null);
    instance.on('mouseover', report);
    instance.on('mouseout', leave);
    instance.on('updateAxisPointer', report);
    instance.on('globalout', leave);
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

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    instance.dispatchAction({ type: 'downplay', seriesIndex: 0 });
    if (highlight !== null) instance.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: highlight });
  }, [highlight, option, isDark]);

  return <div ref={host} role="img" aria-label={label} className="w-full" style={{ height }} />;
}
