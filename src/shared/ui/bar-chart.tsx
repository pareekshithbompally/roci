import React, { useLayoutEffect, useRef, useState } from 'react';
import { UI_CONFIG, type TileTint } from '@config/ui.config';
import { platform } from '@platform/index';

/** One bar: `label` names it on the axis and for assistive tech, `value` sets its height. */
export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

export interface BarChartProps {
  data: readonly BarDatum[];
  /** The series hue: the tile colour of what the chart is about. */
  tint: TileTint;
  /** Ascending axis values from 0; the last is the top of the plot. */
  ticks: readonly number[];
  formatTick: (value: number) => string;
  /** Index of the bar the reader picked; the others dim and a marker stands on it. */
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** What the chart shows, for assistive tech ("Cost per day, 18 Oct – 17 Nov"). */
  label: string;
}

const C = UI_CONFIG.chart;
const HEIGHT = platform.hasTouchScreen ? C.touch.height : C.height;

/** Marks read their colours straight from the tokens, so light and dark are exact and need no generated classes. */
const tintFill = (tint: TileTint) => `var(--bg-tile-${tint})`;
const GRID = 'var(--border-muted)';
const MARKER = 'var(--border-strong)';

/** A column: rounded at its data end, square on the baseline. */
function barPath(x: number, width: number, top: number, base: number): string {
  const r = Math.min(C.barRadius, width / 2, base - top);
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${base} Z`;
}

/** Axis label positions: the latest bar always, then every `step` back, so "today" is never unlabelled. */
function labelledIndices(count: number): Set<number> {
  const step = Math.max(1, Math.ceil(count / C.xLabels));
  const out = new Set<number>();
  for (let i = count - 1; i >= 0; i -= step) out.add(i);
  return out;
}

/** The container's width, kept current as the panel resizes. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured before the first paint, so the chart never shows a frame without its bars.
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Single-series bar chart (Health style): hairline grid, ticks on the right, sparse dates below; hover (mouse) or tap (touch) picks a bar, arrow keys move it. */
export function BarChart({ data, tint, ticks, formatTick, selected, onSelect, label }: BarChartProps) {
  const [ref, width] = useWidth();
  const plotW = Math.max(0, width - C.axisWidth);
  const plotH = HEIGHT - C.xAxisHeight;
  const top = ticks[ticks.length - 1] || 1;
  const slot = data.length ? plotW / data.length : 0;
  const barW = Math.max(1, Math.min(C.barMax, slot - C.barGap));
  const labels = labelledIndices(data.length);

  const indexAt = (clientX: number, el: Element) => {
    const x = clientX - el.getBoundingClientRect().left;
    return x < 0 || x >= plotW || slot === 0 ? null : Math.min(data.length - 1, Math.floor(x / slot));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') onSelect(indexAt(e.clientX, e.currentTarget));
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') onSelect(null);
  };
  /** A tap (touch, pen) picks a bar and a second tap on it clears; the mouse picks by hovering. */
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    const i = indexAt(e.clientX, e.currentTarget);
    onSelect(i === selected ? null : i);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = data.length - 1;
    if (e.key === 'Escape') return onSelect(null);
    if (e.key === 'ArrowLeft') onSelect(Math.max(0, (selected ?? last + 1) - 1));
    else if (e.key === 'ArrowRight') onSelect(Math.min(last, (selected ?? -1) + 1));
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      tabIndex={0}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className="w-full cursor-default touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-md"
      style={{ height: HEIGHT }}
    >
      {width > 0 && (
        <svg width={width} height={HEIGHT} aria-hidden className="block overflow-visible">
          {ticks.map((t) => {
            const y = plotH - (t / top) * plotH;
            return (
              <g key={t}>
                <line x1={0} x2={plotW} y1={y} y2={y} strokeWidth={1} stroke={GRID} />
                <text x={plotW + C.axisGap} y={y} dominantBaseline="middle" className="fill-current text-faint text-subheadline tabular-nums">
                  {formatTick(t)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / top) * plotH;
            if (h <= 0) return null;
            const x = i * slot + (slot - barW) / 2;
            const dim = selected !== null && selected !== i;
            return <path key={d.key} d={barPath(x, barW, plotH - h, plotH)} fill={tintFill(tint)} opacity={dim ? C.dimOpacity : 1} />;
          })}
          {selected !== null && slot > 0 && (
            <line x1={(selected + 0.5) * slot} x2={(selected + 0.5) * slot} y1={0} y2={plotH} strokeWidth={1} stroke={MARKER} />
          )}
          {data.map((d, i) => labels.has(i) && (
            <text
              key={d.key}
              x={i === 0 ? 0 : i === data.length - 1 ? plotW : (i + 0.5) * slot}
              y={plotH + C.axisGap}
              dominantBaseline="hanging"
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              className="fill-current text-faint text-subheadline"
            >
              {d.label}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
