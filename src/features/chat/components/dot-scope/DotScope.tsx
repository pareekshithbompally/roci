/**
 * DotScope — Hex's recording indicator: a pill of dots lit by a braided pair
 * of oscilloscope traces that follow the voice, cooling to blue light that
 * flows through the braid while transcribing.
 *
 * Simulation: `scope.ts` (Hex `dot_scope/scope.rs`). Drawing: Hex's
 * `rune_hud.wgsl` plate, rim, glow and dots, on a 2D canvas.
 *
 * The plate takes any `DotScopeTuning` — the composer's band passes a
 * per-capture tuning with a wider plate and more columns (`band.ts`), and the
 * simulation and drawing run unchanged, just on a longer instrument.
 *
 * Mount it inside framer-motion's <AnimatePresence>: on exit it plays Hex's
 * done wipe (the field clears from the middle out), fades, then unmounts.
 */

import React, { useEffect, useRef } from 'react';
import { usePresence, useReducedMotion } from 'framer-motion';
import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';
import type { DotScopeTheme, DotScopeTuning } from '@config/dotScope.config';
import { Scope, loudness } from './scope';
import type { Pose, Stage } from './scope';

type Rgb = readonly [number, number, number];

/** A flat theme override, or a nested one resolved against the current mode. */
export type DotScopePalette =
  | Partial<DotScopeTheme>
  | { dark: Partial<DotScopeTheme>; light: Partial<DotScopeTheme> };

export interface DotScopeProps {
  stage: Extract<Stage, 'recording' | 'processing' | 'failed'>;
  /** Live microphone stream; its level drives the traces while recording. */
  stream?: MediaStream | null;
  /** Accessible label (e.g. "Recording", "Transcribing"). */
  label: string;
  /** Draws the whole pill larger (1 = Hex's 112×26 pt plate). */
  zoom?: number;
  /** Plate tuning; defaults to Hex's. Must stay stable while mounted. */
  tuning?: DotScopeTuning;
  /** Palette override merged over the dark/light theme (e.g. composer accent). */
  palette?: DotScopePalette;
  /** Canvas margins (pt) around the plate for the shadow; tighten to hug the pill. */
  margins?: { x: number; y: number };
}

const { canvasMargin, doneHold } = DOT_SCOPE_CONFIG;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
/** CSS colour from sRGB 0–1 components; alpha from the 4th component unless given. */
const css = (c: readonly number[], alpha = c[3] ?? 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

function saturate(color: Rgb, amount: number): Rgb {
  const luma = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  const s = (c: number) => Math.min(Math.max(luma + (c - luma) * amount, 0), 1);
  return [s(color[0]), s(color[1]), s(color[2])];
}

/** Signed distance from `p` to a rounded box centred on the origin (shader `rounded_box`). */
function roundedBox(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function platePath(ctx: CanvasRenderingContext2D, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, hw * 2, hh * 2, hh);
}

function drawPlate(ctx: CanvasRenderingContext2D, pose: Pose, theme: DotScopeTheme, base: Rgb, core: Rgb, deviceScale: number): void {
  const hw = pose.width / 2;
  const hh = pose.height / 2;
  ctx.save();
  // Drop shadow only when the palette asks for one — the composer disables it
  // (shadowBlur per frame is expensive and reads as a dull halo).
  if (theme.shadow[3] > 0) {
    ctx.shadowColor = css(theme.shadow);
    // Shadow sizes are in device pixels; the canvas transform doesn't apply to them.
    ctx.shadowBlur = 13 * deviceScale * pose.scale;
    ctx.shadowOffsetY = 3 * deviceScale * pose.scale;
  }
  platePath(ctx, hw, hh);
  ctx.fillStyle = css(theme.plate);
  ctx.fill();
  ctx.restore();
  platePath(ctx, hw - 0.3, hh - 0.3);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = css(theme.rim);
  ctx.stroke();
  if (pose.glow > 0.01) {
    const reach = 34 + 20 * pose.glow;
    const strength = theme.glowStrength * 0.55 * Math.min(1, pose.glow);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    glow.addColorStop(0, css(mix3(base, core, 0.5), strength));
    glow.addColorStop(1, css(base, 0));
    ctx.fillStyle = glow;
    ctx.fill();
  }
}

function drawDots(ctx: CanvasRenderingContext2D, scope: Scope, pose: Pose, theme: DotScopeTheme, base: Rgb, core: Rgb): void {
  const hw = pose.width / 2;
  const hh = pose.height / 2;
  const pitch = scope.tuning.spacing;
  const offX = (scope.columns - 1) / 2;
  const offY = (scope.rows - 1) / 2;
  const presence = 0.5 + 0.5 * Math.max(pose.live, pose.cool);
  for (let j = 0; j < scope.rows; j++) {
    for (let i = 0; i < scope.columns; i++) {
      const cx = (i - offX) * pitch;
      const cy = (j - offY) * pitch;
      const mask = sstep(1.4, 4.6, -roundedBox(cx, cy, hw, hh, hh));
      if (mask <= 0) continue;
      const n = j * scope.columns + i;
      const power = Math.max(scope.dots[n * 2], 1e-5);
      const fresh = scope.dots[n * 2 + 1];
      const floor = theme.unlit * (1 - 0.7 * sstep(0.35, 0.95, Math.abs(cy) / hh)) * presence * pose.grid;
      const alpha = floor + (theme.full - floor) * Math.pow(power, theme.curve * mix(1.4, 1, fresh));
      const radius = (0.25 + 0.17 * Math.pow(power, 0.6)) * mix(1, mix(0.82, 1, fresh), sstep(0.03, 0.2, power)) * pitch;
      const color = mix3(base, core, Math.min(Math.max(power * power * 1.1, 0), 0.9) * mix(0.3, 1, fresh));
      if (power > 0.05) {
        ctx.fillStyle = css(color, 0.132 * power * power * mask);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = css(color, alpha * mask);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** One frame. save/restore so the plate clip and paint state never leak into the next frame. */
function draw(
  ctx: CanvasRenderingContext2D,
  scope: Scope,
  dark: boolean,
  deviceScale: number,
  canvasWidth: number,
  canvasHeight: number,
  palette?: DotScopePalette,
): void {
  const pose = scope.pose();
  const baseTheme = DOT_SCOPE_CONFIG.theme[dark ? 'dark' : 'light'];
  const override =
    palette && 'dark' in palette && 'light' in palette
      ? (dark ? palette.dark : palette.light)
      : palette;
  const theme = { ...baseTheme, ...override };
  const base = saturate(mix3(mix3(theme.you, theme.agent, pose.cool), theme.coral, pose.fail), scope.tuning.saturation);
  const core = saturate(mix3(mix3(theme.youCore, theme.agentCore, pose.cool), theme.coralCore, pose.fail), scope.tuning.saturation);
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.scale(pose.scale, pose.scale);
  ctx.globalAlpha = pose.opacity;
  ctx.filter = pose.softness > 0.05 ? `blur(${pose.softness * 0.72}px)` : 'none';
  drawPlate(ctx, pose, theme, base, core, deviceScale);
  platePath(ctx, pose.width / 2, pose.height / 2);
  ctx.clip();
  drawDots(ctx, scope, pose, theme, base, core);
  ctx.restore();
}

/** RMS loudness of a live stream, dBFS (Hex `loudness`), read once per frame. */
function useStreamLoudness(stream: MediaStream | null | undefined) {
  const read = useRef<() => number>(() => -120);
  useEffect(() => {
    if (!stream) {
      read.current = () => -120;
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    read.current = () => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const s of buffer) sum += s * s;
      return loudness(Math.sqrt(sum / buffer.length));
    };
    return () => {
      read.current = () => -120;
      void context.close();
    };
  }, [stream]);
  return read;
}

export const DotScope: React.FC<DotScopeProps> = ({ stage, stream, label, zoom = 1, tuning, palette, margins }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPresent, safeToRemove] = usePresence();
  const reduceMotion = useReducedMotion() ?? false;
  const readLoudness = useStreamLoudness(stream);
  const plate = tuning ?? DOT_SCOPE_CONFIG.tuning;
  const margin = margins ?? canvasMargin;
  const canvasWidth = Math.max(plate.width, plate.processingWidth) + 2 * margin.x;
  const canvasHeight = plate.height + 2 * margin.y;
  const live = useRef({ stage, isPresent, reduceMotion, safeToRemove });
  live.current = { stage, isPresent, reduceMotion, safeToRemove };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const deviceScale = (window.devicePixelRatio || 1) * zoom;
    canvas.width = canvasWidth * deviceScale;
    canvas.height = canvasHeight * deviceScale;
    const scope = new Scope(plate);
    let last = performance.now();
    let exitAt: number | null = null;
    let frame = 0;

    const tick = (now: number) => {
      const { stage: wanted, isPresent: present, reduceMotion: rm, safeToRemove: remove } = live.current;
      const dt = (now - last) / 1000;
      last = now;
      if (!present && exitAt === null) exitAt = now;
      const exiting = exitAt !== null;
      const visible = !exiting || (now - (exitAt ?? now)) / 1000 < doneHold;
      scope.advance(dt, { stage: exiting ? 'done' : wanted, visible, loudness: readLoudness.current(), reduceMotion: rm });
      draw(ctx, scope, document.documentElement.classList.contains('dark'), deviceScale, canvasWidth, canvasHeight, palette);
      if (exiting && !visible && scope.settled()) {
        remove?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [plate, canvasWidth, canvasHeight, readLoudness, zoom, palette]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}
    />
  );
};
