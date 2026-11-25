/** Horizon simulation at a fixed 240 Hz: three voice bands whose recent past travels out from the centre, and the line's pose. */

import { HORIZON_CONFIG } from '@config/horizon.config';
import type { HorizonStage, HorizonTuning } from '@config/horizon.config';
import { Spring } from './spring';
import type { Spec } from './spring';

const TAU = Math.PI * 2;
const STEP = 1 / 240;
const HISTORY = 512;
const BREATH_PERIOD = 5.5;
const HIDDEN_SCALE = 0.9;
const HIDDEN_SOFTNESS = 3;
const LIVE_FOLLOW = 0.55;
const ENVELOPE_RISE = 0.022;
const AMPLITUDE_DAMPING = 0.52;
const GLOW_RISE = 0.25;
const GLOW_FALL = 1.2;
/** How much of the dawn glow the calm transcribing waves keep lit. */
const WORKING_GLOW = 0.3;
/** Width over which teal blends into copper at its front, pt. */
const COOL_FRONT = 24;
/** Standing loops in the failure twang. */
const PLUCK_LOOPS = 2;
/** Ribbon window: ends pinned, middle free. */
const WINDOW_POWER = 1.6;

const AUTO_MIN_SPAN = 16;
const AUTO_RANGE = 24;
const AUTO_ROOM_MARGIN = 5;
const AUTO_ATTACK = 0.04;
const ROOM_FALL = 0.3;
const ROOM_RISE = 6;

export type Stage = HorizonStage;

export interface Frame {
  stage: Stage;
  visible: boolean;
  /** Microphone loudness per ribbon band, dBFS. */
  bands: readonly number[];
  reduceMotion: boolean;
}

/** The line's pose and the field's global terms, for the renderer. */
export interface Pose {
  height: number;
  opacity: number;
  scale: number;
  softness: number;
  /** Red (failed) mix, 0–1; the teal of transcribing spreads by `coolAt`. */
  fail: number;
  glow: number;
  /** Slow rest breath, 0–1. */
  breath: number;
  /** How far the line reaches across its row, 0–1: it draws out from the centre on enter and back in on exit. */
  reach: number;
  /** Calm transcribing waves, 0–1. */
  gather: number;
  /** Sideways shake, pt. */
  shake: number;
}

/** One ribbon sample: its top, centre and bottom (pt from the line) and the voice level there. */
export interface RibbonSample {
  top: number;
  center: number;
  bottom: number;
  level: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

const follow = (value: number, target: number, rise: number, fall: number, h: number) =>
  value + (target - value) * (1 - Math.exp(-h / (target > value ? rise : fall)));

/** A meter's RMS or a band's power as dBFS. */
export const loudness = (rms: number) => 20 * Math.log10(Math.max(rms, 0) + 1e-6);

/** Slow auto level: the speaker's recent peak reads as full and the room as silent. */
class AutoLevel {
  peak = -30;
  room = -55;

  step(loudnessDb: number, h: number, release: number, noiseFloor: number): number {
    const db = Math.max(loudnessDb, -120);
    const ease = (value: number, target: number, time: number) =>
      value + (target - value) * (1 - Math.exp(-h / Math.max(time, 1e-3)));
    this.room = ease(this.room, db, db < this.room ? ROOM_FALL : ROOM_RISE);
    const lowest = Math.max(this.room, noiseFloor) + AUTO_MIN_SPAN;
    this.peak = db > this.peak ? ease(this.peak, db, AUTO_ATTACK) : ease(this.peak, lowest, release);
    this.peak = Math.max(this.peak, lowest);
    const low = Math.max(Math.max(this.room, noiseFloor) + AUTO_ROOM_MARGIN, this.peak - AUTO_RANGE);
    return clamp((db - low) / Math.max(this.peak - low, 1), 0, 1);
  }
}

/** One voice band: a fast envelope, an amplitude spring on it, a drifting phase, and its recent past. */
class Band {
  readonly auto = new AutoLevel();
  envelope = 0;
  amplitude = 0;
  velocity = 0;
  private history = new Float32Array(HISTORY);
  private head = 0;

  constructor(public phase: number) {}

  tick(level: number, live: number, drift: number, tuning: HorizonTuning, h: number): void {
    this.envelope = follow(this.envelope, level, ENVELOPE_RISE, tuning.release, h);
    const w = TAU * tuning.response;
    this.velocity += (-w * w * (this.amplitude - this.envelope) - 2 * AMPLITUDE_DAMPING * w * this.velocity) * h;
    this.amplitude += this.velocity * h;
    this.phase = (this.phase + h * drift * (0.5 + 1.4 * this.envelope)) % TAU;
    this.history[this.head] = Math.max(this.amplitude, 0) * live;
    this.head = (this.head + 1) % HISTORY;
  }

  /** The level `delay` seconds ago, interpolated. */
  past(delay: number): number {
    const d = Math.min(delay / STEP, HISTORY - 2);
    const i = Math.floor(d);
    const k = d - i;
    const a = (this.head + 2 * HISTORY - 1 - i) % HISTORY;
    const b = (a + HISTORY - 1) % HISTORY;
    return this.history[a] * (1 - k) + this.history[b] * k;
  }
}

export class Field {
  readonly tuning: HorizonTuning = HORIZON_CONFIG.tuning;
  private stage: Stage = 'recording';
  private elapsed = 0;
  private time = 0;
  /** Clock of the transcribing waves; frozen under Reduce Motion. */
  private flow = 0;
  private pending = 0;
  private reduceMotion = false;
  private live = 0;
  private glow = 0;
  private bands = HORIZON_CONFIG.ribbons.map((_, i) => new Band(i * 2.1));
  private reach = new Spring(0);
  private opacity = new Spring(0);
  private scale = new Spring(HIDDEN_SCALE);
  private softness = new Spring(HIDDEN_SOFTNESS);
  private cool = new Spring(0);
  private fail = new Spring(0);
  private gather = new Spring(0);
  private shake = new Spring(0);

  pose(): Pose {
    return {
      height: this.tuning.height,
      opacity: clamp(this.opacity.x, 0, 1),
      scale: Math.max(this.scale.x, 0.01),
      softness: clamp(this.softness.x, 0, HIDDEN_SOFTNESS),
      fail: clamp(this.fail.x, 0, 1),
      glow: this.glow * this.tuning.glow,
      breath: this.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin((this.time * TAU) / BREATH_PERIOD),
      reach: clamp(this.reach.x, 0, 1.05),
      gather: clamp(this.gather.x, 0, 1.2),
      shake: this.shake.x,
    };
  }

  /** Half the height a ribbon may use: the row's half height less the rim clearance, pt. */
  free(): number {
    return this.tuning.height / 2 - this.tuning.rimClearance;
  }

  /** Soft ceiling: loud speech rounds off at the free height instead of reaching the rim. */
  limit(y: number): number {
    const free = this.free();
    return free * Math.tanh(y / free);
  }

  /** How teal the line is `x` pt from its centre: teal spreads out from the centre as transcribing starts. */
  coolAt(x: number, half: number): number {
    const cool = clamp(this.cool.x, 0, 1);
    if (this.stage !== 'processing' || this.reduceMotion) return cool;
    const reach = (half + COOL_FRONT) * smoothstep(0, this.tuning.handover, this.elapsed);
    return cool * (1 - smoothstep(reach - COOL_FRONT, reach, Math.abs(x)));
  }

  /** Where the gathering waves meet, 0–1: high as each crest arrives at the centre. */
  arrival(): number {
    return 0.5 + 0.5 * Math.sin(TAU * HORIZON_CONFIG.ribbons[0].gather.rate * this.flow - Math.PI / 2);
  }

  /** Failed: the line's one plucked twang, pt, at `u` (0–1 along it). */
  pluck(u: number): number {
    if (this.stage !== 'failed' || this.reduceMotion) return 0;
    const { pluck, pluckDecay, pluckHz } = HORIZON_CONFIG.failed;
    const t = this.elapsed;
    return pluck * Math.exp(-t / pluckDecay) * Math.sin(TAU * PLUCK_LOOPS * u) * Math.sin(TAU * pluckHz * t);
  }

  /** Ribbon `i` at `u` (0–1 along a line `half` pt each side): its voice now, delayed by distance, plus the calm waves. */
  ribbonAt(i: number, u: number, half: number, out: RibbonSample): void {
    const ribbon = HORIZON_CONFIG.ribbons[i];
    const band = this.bands[i];
    const xn = 2 * u - 1;
    const d = Math.abs(xn);
    const window = Math.pow(Math.max(1 - xn * xn, 0), WINDOW_POWER);
    const level = band.past((d * half) / this.tuning.historySpeed);
    const free = this.free();
    // Waves keep their size on any line: a longer line holds more of them.
    const span = (2 * half) / this.tuning.referenceSpan;
    const direction = i % 2 ? -1 : 1;
    const voice = level * ribbon.height * Math.sin(ribbon.cycles * span * Math.PI * xn + band.phase * direction);
    const gather = this.gather.x * ribbon.gather.height * smoothstep(0.04, 0.4, d)
      * Math.sin(TAU * (ribbon.gather.waves * span * d + ribbon.gather.rate * this.flow));
    const center = free * (voice + gather) * window + this.pluck(u);
    const thickness = (0.25 + 1.6 * level + 0.5 * this.gather.x) * ribbon.thickness * free * 0.5 * window;
    out.top = this.limit(center - thickness / 2);
    out.center = this.limit(center);
    out.bottom = this.limit(center + thickness / 2);
    out.level = level;
  }

  /** Advances by `dt` seconds in fixed 240 Hz steps. */
  advance(dt: number, frame: Frame): void {
    this.reduceMotion = frame.reduceMotion;
    if (frame.stage !== this.stage) this.enter(frame.stage);
    this.pending += clamp(dt, 0, 0.25);
    while (this.pending >= STEP) {
      this.pending -= STEP;
      this.step(frame);
    }
  }

  private enter(stage: Stage): void {
    if (stage === 'processing') this.flow = 0;
    if (stage === 'failed' && !this.reduceMotion) this.shake.v = HORIZON_CONFIG.failed.kick;
    this.stage = stage;
    this.elapsed = 0;
  }

  private step(frame: Frame): void {
    const h = STEP;
    const { tuning } = this;
    const recording = this.stage === 'recording' && frame.visible;
    this.live += ((recording ? 1 : 0) - this.live) * (1 - Math.exp(-h / LIVE_FOLLOW));
    const drift = frame.reduceMotion ? 0 : 1;
    let energy = 0;
    this.bands.forEach((band, i) => {
      const raw = recording ? band.auto.step(frame.bands[i] ?? -120, h, tuning.autoRelease, tuning.noiseFloor) : 0;
      band.tick(clamp(raw * tuning.gain, 0, 1), this.live, HORIZON_CONFIG.ribbons[i].drift * drift, tuning, h);
      energy = Math.max(energy, band.envelope);
    });
    if (this.stage === 'processing' && !frame.reduceMotion) this.flow += h;
    this.glow = follow(this.glow, energy * this.live + WORKING_GLOW * this.gather.x, GLOW_RISE, GLOW_FALL, h);
    this.stepSprings(frame, h);
    this.elapsed += h;
    this.time += h;
  }

  private stepSprings(frame: Frame, h: number): void {
    const { tuning, stage } = this;
    const cool = stage === 'processing' ? 1 : 0;
    const fail = stage === 'failed' ? 1 : 0;
    const shown = frame.visible ? 1 : 0;
    const gather = stage === 'processing' ? 1 : 0;
    if (frame.reduceMotion) {
      this.reach.jump(1);
      this.scale.jump(1);
      this.softness.jump(0);
      this.gather.jump(gather);
      this.shake.jump(0);
      this.opacity.stepTo(shown, HORIZON_CONFIG.reducedFade, h);
      this.cool.stepTo(cool, HORIZON_CONFIG.reducedFade, h);
      this.fail.stepTo(fail, HORIZON_CONFIG.reducedFade, h);
      return;
    }
    const fade: Spec = { duration: tuning.transition, bounce: 0 };
    const bouncy: Spec = { duration: tuning.transition, bounce: tuning.bounce };
    // Draws out from the centre on enter, back into it on exit: the same gesture both ways.
    this.reach.stepTo(shown, frame.visible ? bouncy : fade, h);
    this.opacity.stepTo(shown, fade, h);
    this.scale.stepTo(frame.visible ? 1 : HIDDEN_SCALE, bouncy, h);
    this.softness.stepTo(frame.visible ? 0 : HIDDEN_SOFTNESS, fade, h);
    this.cool.stepTo(cool, fade, h);
    this.fail.stepTo(fail, fade, h);
    this.gather.stepTo(gather, HORIZON_CONFIG.gather, h);
    this.shake.stepTo(0, HORIZON_CONFIG.failed.shake, h);
  }
}
