/**
 * Dot Scope Configuration — Hex's recording indicator (the dot-matrix pill).
 *
 * Ported from Hex (MIT, src-tauri/licenses/HEX-MIT.txt):
 * `src/rune_hud/dot_scope.rs` (Tuning defaults), `dot_scope/scope.rs`
 * (palette), `rune_hud/spring.rs` (MORPH) and `rune_hud.wgsl` (dot look).
 * Values are Hex's defaults; change them here, never in the component.
 */

export type DotScopeProcessing = 'sweep' | 'flow' | 'pulse';

export interface DotScopeTuning {
  columns: number;
  rows: number;
  /** Dot pitch, pt. */
  spacing: number;
  /** Plate width while recording, pt. */
  width: number;
  /** Plate width while transcribing, pt. */
  processingWidth: number;
  height: number;
  braidSpeed: number;
  helixCycles: number;
  gain: number;
  /** Amplitude spring frequency, Hz. */
  response: number;
  release: number;
  /** Voice history travel speed from the centre, pt/s. */
  historySpeed: number;
  /** Phosphor tail, s. */
  phosphor: number;
  glow: number;
  saturation: number;
  /** One processing beam pass, s. */
  shimmerPass: number;
  shimmer: number;
  /** Enter, exit and morph duration, s. */
  transition: number;
  bounce: number;
  autoLevel: boolean;
  autoRelease: number;
  /** dBFS below which input never lights the scope. */
  noiseFloor: number;
  processing: DotScopeProcessing;
}

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

export interface DotScopeTheme {
  you: Rgb;
  youCore: Rgb;
  agent: Rgb;
  agentCore: Rgb;
  coral: Rgb;
  coralCore: Rgb;
  plate: Rgba;
  rim: Rgba;
  shadow: Rgba;
  /** Unlit dot floor alpha, full alpha, brightness curve, glow strength (shader). */
  unlit: number;
  full: number;
  curve: number;
  glowStrength: number;
}

export const DOT_SCOPE_CONFIG = {
  tuning: {
    columns: 43,
    rows: 9,
    spacing: 2.6,
    width: 112,
    processingWidth: 76,
    height: 26,
    braidSpeed: 1,
    helixCycles: 1.6,
    gain: 1,
    response: 6.5,
    release: 0.15,
    historySpeed: 150,
    phosphor: 0.6,
    glow: 1,
    saturation: 1,
    shimmerPass: 0.55,
    shimmer: 1,
    transition: 0.3,
    bounce: 0.15,
    autoLevel: true,
    autoRelease: 3,
    noiseFloor: -60,
    processing: 'flow',
  } satisfies DotScopeTuning,

  /** Short opacity-only fade under Reduce Motion (Hex REDUCED_FADE). */
  reducedFade: { duration: 0.16, bounce: 0 },

  /** Room around the plate on the canvas for the drop shadow, pt. */
  canvasMargin: { x: 16, y: 12 },

  /** Takeover-lite band in the chat composer: while recording the plate
   *  stretches across the text slot (a per-capture tuning widens the plate and
   *  grows the column count, so the simulation runs unchanged on a longer
   *  instrument), while transcribing it contracts to Hex's processing pill.
   *  `plateHeight` sets the band's zoom (plateHeight / 26) and the slot's
   *  height; `handoff` is how long the row waits — the done wipe — before the
   *  textarea fades back in. See shared/components/dot-scope/band.ts. */
  composerBand: {
    plateHeight: 38,
    handoff: 0.35,
  },

  /** How long the done wipe plays before the pill fades out, s. */
  doneHold: 0.35,

  /** Warm pearl while recording, cooling to agent blue while processing, coral on failure (sRGB 0–1). */
  theme: {
    dark: {
      you: [0.86, 0.83, 0.77],
      youCore: [0.98, 0.96, 0.92],
      agent: [0.70, 0.78, 0.90],
      agentCore: [0.92, 0.95, 1.0],
      coral: [1.0, 0.38, 0.31],
      coralCore: [1.0, 0.66, 0.6],
      plate: [17 / 255, 17 / 255, 20 / 255, 0.94],
      rim: [1, 1, 1, 0.11],
      shadow: [0, 0, 0, 0.5],
      unlit: 0.07,
      full: 0.96,
      curve: 0.9,
      glowStrength: 0.3,
    },
    light: {
      you: [0.62, 0.53, 0.40],
      youCore: [0.47, 0.38, 0.26],
      agent: [0.40, 0.47, 0.58],
      agentCore: [0.24, 0.31, 0.43],
      coral: [0.9, 0.27, 0.21],
      coralCore: [0.7, 0.18, 0.13],
      plate: [252 / 255, 251 / 255, 249 / 255, 0.96],
      rim: [0, 0, 0, 0.09],
      shadow: [20 / 255, 24 / 255, 40 / 255, 0.2],
      unlit: 0.085,
      full: 1.0,
      curve: 0.75,
      glowStrength: 0.19,
    },
  } satisfies Record<'dark' | 'light', DotScopeTheme>,
} as const;
