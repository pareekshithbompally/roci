/** Dot Scope recording indicator (the dot-matrix pill); tune it here, never in the component. */

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

/** The pill's look per theme; its colours come from the `--scope-*` tokens. */
export interface DotScopeLook {
  plateAlpha: number;
  rimAlpha: number;
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

  /** Short opacity-only fade under Reduce Motion. */
  reducedFade: { duration: 0.16, bounce: 0 },

  /** Room around the plate on the canvas for the drop shadow, pt. */
  canvasMargin: { x: 16, y: 12 },

  /** Composer pill, alone while recording; `plateHeight` sets zoom, `handoff` the wait before the box returns. */
  composer: {
    plateHeight: 40,
    marginX: 10,
    marginY: 6,
    /** Delay after the transcription response lands before the box expands back, s. */
    handoff: 0.2,
    /** Live dictation line below the controls, fixed height and shown from the first frame so nothing moves. */
    liveText: { heightPx: 36, placeholder: 'Listening…' },
  },

  /**
   * Colour token per part (tokens.css `--scope-*`): copper voice, sand while
   * processing, danger red on failure, and the plate and rim. Read live, so
   * the pill follows the theme.
   */
  colors: {
    you: '--scope-you',
    youCore: '--scope-you-core',
    agent: '--scope-agent',
    agentCore: '--scope-agent-core',
    fail: '--scope-fail',
    failCore: '--scope-fail-core',
    plate: '--scope-plate',
    rim: '--scope-rim',
  },

  /** A glassy plate and a glow that dances with the voice. */
  look: {
    dark: { plateAlpha: 0.92, rimAlpha: 0.16, unlit: 0.06, full: 1.0, curve: 0.9, glowStrength: 0.6 },
    light: { plateAlpha: 0.94, rimAlpha: 0.1, unlit: 0.07, full: 1.0, curve: 0.75, glowStrength: 0.5 },
  } satisfies Record<'dark' | 'light', DotScopeLook>,

  /** How long the done wipe plays before the pill fades out, s. */
  doneHold: 0.35,
} as const;
