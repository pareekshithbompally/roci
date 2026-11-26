/** Dictation voice indicator: a full-width glowing line that opens into ribbons with your voice. Inside AnimatePresence it draws
 *  back into its centre while its parent leaves; the parent's exit, not the canvas, decides when it is gone. */

import React, { useEffect, useRef } from 'react';
import { useIsPresent, useReducedMotion } from 'framer-motion';
import { HORIZON_CONFIG } from '@config/horizon.config';
import { tokenRgb } from '@shared/utils/cssToken';
import type { HorizonLook } from '@config/horizon.config';
import { Field, loudness } from './field';
import type { Pose, RibbonSample, Stage } from './field';

type Rgb = readonly [number, number, number];

/** Everything a frame paints with: the theme's look and its token colours. */
type Theme = HorizonLook & Record<keyof typeof HORIZON_CONFIG.colors, Rgb>;

const { ribbons, tuning } = HORIZON_CONFIG;
const SAMPLES = 140;
const LINE_SAMPLES = 80;
const GRADIENT_STOPS = 16;
const FFT_SIZE = 2048;
const SILENT: readonly number[] = ribbons.map(() => -120);
/** The thread along each ribbon's centre leans this far toward the line colour. */
const SHEEN = 0.5;
/** Dawn glow: a wide, low band under the line (its unit circle, stretched to the line and flattened), pt. */
const GLOW_RADIUS = 46;
const GLOW_UNIT = 40;
const GLOW_FLATTEN = 0.32;
const GLOW_DROP = 8;
const CORE_RADIUS = 8;
const CORE_STRETCH = 2.2;

/** The theme for light or dark, its colours resolved on `element` from their tokens (once per theme, not per frame). */
function readTheme(element: HTMLElement, dark: boolean): Theme {
  const colors = Object.fromEntries(
    Object.entries(HORIZON_CONFIG.colors).map(([part, token]) => [part, tokenRgb(element, token)]),
  ) as Record<keyof typeof HORIZON_CONFIG.colors, Rgb>;
  return { ...HORIZON_CONFIG.look[dark ? 'dark' : 'light'], ...colors };
}

export interface HorizonProps {
  stage: Stage;
  /** Live microphone stream; its three bands drive the ribbons while recording. */
  stream?: MediaStream | null;
  /** Accessible label (e.g. "Recording", "Transcribing"). */
  label: string;
}

/** One frame's painting state. */
interface Paint {
  ctx: CanvasRenderingContext2D;
  field: Field;
  pose: Pose;
  theme: Theme;
  /** Half the line, pt. */
  half: number;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
/** CSS colour from sRGB 0–1 components and an alpha. */
const css = (c: Rgb, alpha: number) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${Math.min(Math.max(alpha, 0), 1)})`;
/** The line's ends fade to nothing, so it has no hard tips. */
const edge = (u: number) => Math.pow(Math.max(Math.sin(Math.PI * u), 0), 0.9);

/** A colour at `x` pt along the line: warm while you speak, cool where Roci's teal has reached, red on failure. */
const tint = (p: Paint, warm: Rgb, cool: Rgb, x: number): Rgb =>
  mix3(mix3(warm, cool, p.field.coolAt(x, p.half)), p.theme.fail, p.pose.fail);

/** A left-to-right gradient across the line, its colour and alpha sampled along it. */
function along(p: Paint, colorAt: (u: number) => Rgb, alphaAt: (u: number) => number): CanvasGradient {
  const gradient = p.ctx.createLinearGradient(-p.half, 0, p.half, 0);
  for (let k = 0; k <= GRADIENT_STOPS; k++) {
    const u = k / GRADIENT_STOPS;
    gradient.addColorStop(u, css(colorAt(u), alphaAt(u)));
  }
  return gradient;
}

/** A soft dawn under the line that brightens with how much you've been speaking. */
function drawGlow(p: Paint): void {
  const { ctx, pose, theme, half } = p;
  const color = tint(p, theme.low, theme.work, 0);
  const strength = theme.glowStrength * (0.08 + 0.05 * pose.breath + 0.5 * Math.min(pose.glow, 1));
  ctx.save();
  ctx.scale(Math.max(half, 1) / GLOW_UNIT, GLOW_FLATTEN);
  const glow = ctx.createRadialGradient(0, GLOW_DROP, 0, 0, GLOW_DROP, GLOW_RADIUS);
  glow.addColorStop(0, css(color, strength));
  glow.addColorStop(1, css(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(-GLOW_RADIUS, GLOW_DROP - GLOW_RADIUS, GLOW_RADIUS * 2, GLOW_RADIUS * 2);
  ctx.restore();
}

const TOP = new Float32Array(SAMPLES + 1);
const CENTER = new Float32Array(SAMPLES + 1);
const BOTTOM = new Float32Array(SAMPLES + 1);
const SAMPLE: RibbonSample = { top: 0, center: 0, bottom: 0, level: 0 };

/** Samples ribbon `i` along the line into TOP/CENTER/BOTTOM; returns its loudest point. */
function sampleRibbon(p: Paint, i: number): number {
  let peak = 0;
  for (let s = 0; s <= SAMPLES; s++) {
    p.field.ribbonAt(i, s / SAMPLES, p.half, SAMPLE);
    TOP[s] = SAMPLE.top;
    CENTER[s] = SAMPLE.center;
    BOTTOM[s] = SAMPLE.bottom;
    peak = Math.max(peak, SAMPLE.level);
  }
  return peak;
}

/** One silk ribbon: a filled band with a bright thread along its centre. */
function drawRibbon(p: Paint, i: number): void {
  const { ctx, pose, theme, half } = p;
  const peak = sampleRibbon(p, i);
  const xAt = (s: number) => -half + (s / SAMPLES) * half * 2;
  const warm = theme[(['low', 'mid', 'high'] as const)[i]];
  const cool = mix3(theme.work, theme.workCore, i / Math.max(ribbons.length - 1, 1));
  const colorAt = (u: number) => tint(p, warm, cool, -half + u * half * 2);
  const body = theme.ribbonFloor + theme.ribbonGain * Math.min(peak * 1.4, 1) + 0.15 * pose.gather;

  ctx.beginPath();
  ctx.moveTo(xAt(0), TOP[0]);
  for (let s = 1; s <= SAMPLES; s++) ctx.lineTo(xAt(s), TOP[s]);
  for (let s = SAMPLES; s >= 0; s--) ctx.lineTo(xAt(s), BOTTOM[s]);
  ctx.closePath();
  ctx.fillStyle = along(p, colorAt, (u) => edge(u) * body);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(xAt(0), CENTER[0]);
  for (let s = 1; s <= SAMPLES; s++) ctx.lineTo(xAt(s), CENTER[s]);
  const thread = 0.25 + 0.6 * peak + 0.2 * pose.gather;
  ctx.strokeStyle = along(p, (u) => mix3(colorAt(u), theme.line, SHEEN), (u) => edge(u) * thread);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

/** The horizon line itself: breathing at rest, twanging once on failure. */
function drawLine(p: Paint): void {
  const { ctx, pose, theme, half, field } = p;
  ctx.beginPath();
  for (let s = 0; s <= LINE_SAMPLES; s++) {
    const u = s / LINE_SAMPLES;
    ctx.lineTo(-half + u * half * 2, field.limit(field.pluck(u)));
  }
  const alpha = theme.lineAlpha + 0.2 * pose.breath * (1 - Math.min(pose.glow, 1));
  ctx.strokeStyle = along(p, (u) => tint(p, theme.line, theme.workCore, -half + u * half * 2), (u) => edge(u) * alpha);
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** The teal core the transcribing waves gather into; it swells gently as each crest arrives. */
function drawCore(p: Paint): void {
  const { ctx, pose, theme, field } = p;
  const strength = Math.min(pose.gather, 1);
  if (strength < 0.01) return;
  const arrival = field.arrival();
  const alpha = strength * (0.55 + 0.3 * arrival);
  const radius = CORE_RADIUS + 3 * arrival;
  ctx.save();
  ctx.scale(CORE_STRETCH, 1);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  core.addColorStop(0, css(theme.workCore, alpha));
  core.addColorStop(0.4, css(theme.work, 0.45 * alpha));
  core.addColorStop(1, css(theme.work, 0));
  ctx.fillStyle = core;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

/** One frame across a row `width` pt wide. save/restore so paint state never leaks into the next frame. */
function draw(ctx: CanvasRenderingContext2D, field: Field, theme: Theme, deviceScale: number, width: number): void {
  const pose = field.pose();
  const p: Paint = { ctx, field, pose, theme, half: Math.max(width / 2 - tuning.endInset, 0) * pose.reach };
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  ctx.clearRect(0, 0, width, pose.height);
  ctx.save();
  ctx.translate(width / 2 + pose.shake, pose.height / 2);
  ctx.scale(pose.scale, pose.scale);
  ctx.globalAlpha = pose.opacity;
  drawGlow(p);
  ctx.globalCompositeOperation = theme.blend;
  if (p.half > 0.5) {
    ribbons.forEach((_, i) => drawRibbon(p, i));
    drawLine(p);
  }
  drawCore(p);
  ctx.restore();
}

/** Loudness of each ribbon's band in a live stream, dBFS, read once per frame. */
function useStreamBands(stream: MediaStream | null | undefined) {
  const read = useRef<() => readonly number[]>(() => SILENT);
  useEffect(() => {
    if (!stream) {
      read.current = () => SILENT;
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    // The field's own envelopes do the smoothing.
    analyser.smoothingTimeConstant = 0;
    context.createMediaStreamSource(stream).connect(analyser);
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const binHz = context.sampleRate / analyser.fftSize;
    const bins = ribbons.map(({ band }) => [
      Math.max(1, Math.floor(band[0] / binHz)),
      Math.min(spectrum.length - 1, Math.ceil(band[1] / binHz)),
    ] as const);
    const levels = bins.map(() => -120);
    read.current = () => {
      analyser.getFloatFrequencyData(spectrum);
      bins.forEach(([lo, hi], b) => {
        let power = 0;
        for (let i = lo; i <= hi; i++) power += 10 ** (spectrum[i] / 10);
        levels[b] = loudness(Math.sqrt(power));
      });
      return levels;
    };
    return () => {
      read.current = () => SILENT;
      void context.close();
    };
  }, [stream]);
  return read;
}

/** The canvas's width in pt, kept in step with its row by a ResizeObserver (resize events, never polled). */
function useRowWidth(canvas: React.RefObject<HTMLCanvasElement | null>) {
  const width = useRef(0);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      width.current = entry.contentRect.width;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvas]);
  return width;
}

export const Horizon: React.FC<HorizonProps> = ({ stage, stream, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion() ?? false;
  const readBands = useStreamBands(stream);
  const rowWidth = useRowWidth(canvasRef);
  const live = useRef({ stage, isPresent, reduceMotion });
  live.current = { stage, isPresent, reduceMotion };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const deviceScale = window.devicePixelRatio || 1;
    const field = new Field();
    let last = performance.now();
    let frame = 0;
    let theme: { dark: boolean; value: Theme } | null = null;

    const tick = (now: number) => {
      const { stage: wanted, isPresent: present, reduceMotion: rm } = live.current;
      const dt = (now - last) / 1000;
      last = now;
      field.advance(dt, { stage: wanted, visible: present, bands: readBands.current(), reduceMotion: rm });
      const width = rowWidth.current;
      const pixels = Math.round(width * deviceScale);
      if (canvas.width !== pixels) canvas.width = pixels;
      const dark = document.documentElement.classList.contains('dark');
      if (theme?.dark !== dark) theme = { dark, value: readTheme(canvas, dark) };
      draw(ctx, field, theme.value, deviceScale, width);
      frame = requestAnimationFrame(tick);
    };
    canvas.height = Math.round(tuning.height * deviceScale);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [readBands, rowWidth]);

  return <canvas ref={canvasRef} role="img" aria-label={label} className="block w-full" style={{ height: tuning.height }} />;
};
