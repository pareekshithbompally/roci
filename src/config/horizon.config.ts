/** Horizon, the dictation voice indicator: a full-width line that opens into ribbons as you speak; tune it here, never in the component. */

import { MOTION } from '@config/motion.config';

export type HorizonStage = 'recording' | 'processing' | 'failed';

/** One ribbon: the voice band it follows, how it moves while you speak, and its calm wave while transcribing. */
export interface HorizonRibbon {
  /** Frequency band it follows, Hz. */
  band: readonly [number, number];
  /** Half-waves across a line of `referenceSpan` while speaking (scaled to the real length, so waves keep their size). */
  cycles: number;
  /** Sideways drift while speaking, rad/s at rest. */
  drift: number;
  /** Share of the free height it may swing. */
  height: number;
  /** Thickness, as a share of the free height. */
  thickness: number;
  /** Transcribing: waves from one end to the centre (per `referenceSpan`), waves per second, and share of the free height. */
  gather: { waves: number; rate: number; height: number };
}

export interface HorizonTuning {
  /** Height of the line's row, pt; ribbons stay `rimClearance` inside it. */
  height: number;
  rimClearance: number;
  /** Space kept clear at each end of the line, pt. */
  endInset: number;
  /** Line length the ribbon shapes are tuned for, pt. */
  referenceSpan: number;
  /** Voice history travel speed from the centre, pt/s. */
  historySpeed: number;
  gain: number;
  /** Amplitude spring frequency, Hz. */
  response: number;
  release: number;
  /** Enter, exit and morph duration, s. */
  transition: number;
  bounce: number;
  autoRelease: number;
  /** dBFS below which input never lifts the line. */
  noiseFloor: number;
  /** Teal spreading out from the centre as transcribing starts, s. */
  handover: number;
  glow: number;
}

/** The line's look per theme; its colours come from the `--horizon-*` tokens. */
export interface HorizonLook {
  /** How overlapping ribbons mix: light adds up on a dark surface, ink multiplies on a light one. */
  blend: GlobalCompositeOperation;
  /** Ribbon alpha at rest and the most voice adds. */
  ribbonFloor: number;
  ribbonGain: number;
  lineAlpha: number;
  glowStrength: number;
}

export const HORIZON_CONFIG = {
  tuning: {
    height: 44,
    rimClearance: 5,
    endInset: 6,
    referenceSpan: 600,
    historySpeed: 320,
    gain: 1,
    response: 6.5,
    release: 0.15,
    transition: 0.3,
    bounce: 0.15,
    autoRelease: 3,
    noiseFloor: -60,
    handover: 0.55,
    glow: 1,
  } satisfies HorizonTuning,

  /** Low voice, mid voice, then the hiss of "s" and "sh": each its own ribbon. */
  ribbons: [
    { band: [80, 350], cycles: 2.2, drift: 0.9, height: 1, thickness: 1, gather: { waves: 3, rate: 0.42, height: 0.42 } },
    { band: [350, 2200], cycles: 3.4, drift: 1.6, height: 0.8, thickness: 0.7, gather: { waves: 4.4, rate: 0.55, height: 0.3 } },
    { band: [2200, 7500], cycles: 5.6, drift: 2.7, height: 0.6, thickness: 0.38, gather: { waves: 6.2, rate: 0.7, height: 0.2 } },
  ] satisfies readonly HorizonRibbon[],

  /** Transcription failed: the line shakes "no" while it twangs once. */
  failed: { kick: 190, shake: { duration: 1 / 7, bounce: 0.78 }, pluck: 7, pluckDecay: 0.28, pluckHz: 8 },

  /** Short opacity-only fade under Reduce Motion: the app's one reduced fade (motion.config.ts). */
  reducedFade: { duration: MOTION.reduced, bounce: 0 },

  /** The waves gathering into the core while Roci works (the line's own physics spring). */
  gather: { duration: 0.625, bounce: 0.1 },

  /** The composer while dictating: the words above the line, the line's row with the clock and controls. */
  composer: {
    /** How long the pill stays after capture ends, by how it ended, s (docs/plans/IN-PROGRESS/dictation-flow.md): a short
     *  beat into the box, none for a send (it leaves with the message) or a cancel, long enough to read a message otherwise. */
    hold: { box: 0.2, send: 0, empty: 1, failed: 1.1, quiet: 0 },
    /** Live words: at most this many lines show, the oldest fading out at the top. */
    liveText: { lines: 6, placeholder: 'Listening…' },
  },

  /** Colour token per part (tokens.css `--horizon-*`): copper ribbons for your voice, teal while Roci works, danger red on failure. */
  colors: {
    low: '--horizon-low',
    mid: '--horizon-mid',
    high: '--horizon-high',
    line: '--horizon-line',
    work: '--horizon-work',
    workCore: '--horizon-work-core',
    fail: '--horizon-fail',
    failCore: '--horizon-fail-core',
  },

  look: {
    dark: { blend: 'lighter', ribbonFloor: 0.18, ribbonGain: 0.55, lineAlpha: 0.45, glowStrength: 0.6 },
    light: { blend: 'multiply', ribbonFloor: 0.22, ribbonGain: 0.6, lineAlpha: 0.55, glowStrength: 0.35 },
  } satisfies Record<'dark' | 'light', HorizonLook>,
} as const;
