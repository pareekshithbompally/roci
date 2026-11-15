/** Dot scope simulation at a fixed 240 Hz, yielding (brightness, freshness) per dot, row by row. */

import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';
import type { DotScopeTuning } from '@config/dotScope.config';
import { Spring } from './spring';
import type { Spec } from './spring';

const TAU = Math.PI * 2;
const STEP = 1 / 240;
const HISTORY = 512;
const SAMPLES_PER_COLUMN = 3;
const SPEEDS = [0.8, 1.25, 1.85, 2.6];
const BASE = [0.55, 0.42, 0.3, 0.2];
const SPATIAL = [1.4, 2.4, 3.8, 5.6];
const START_WIDTH = 30;
const ENTER = 0.42;
const WIPE = 0.3;
const PASS_INSET = 9;
const PHOSPHOR_HEAD = 0.15;
const BREATH_PERIOD = 5.5;
const HIDDEN_SCALE = 0.9;
const HIDDEN_SOFTNESS = 3;
const WORK_HELIX = 2.6;
const FLOW_SPACING = 0.7;
const CARRIER_REST = 0.14;
const RING_BIRTH = 0.15;
const BEAM_FADE = 0.14;

const AUTO_MIN_SPAN = 16;
const AUTO_RANGE = 24;
const AUTO_ROOM_MARGIN = 5;
const AUTO_ATTACK = 0.04;
const ROOM_FALL = 0.3;
const ROOM_RISE = 6;

export type Stage = 'recording' | 'processing' | 'done' | 'failed';

export interface Frame {
  stage: Stage;
  visible: boolean;
  /** Microphone loudness, dBFS. */
  loudness: number;
  reduceMotion: boolean;
}

/** The plate's pose and the field's global terms, for the renderer. */
export interface Pose {
  width: number;
  height: number;
  opacity: number;
  scale: number;
  softness: number;
  cool: number;
  fail: number;
  glow: number;
  grid: number;
  live: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const remEuclid = (a: number, b: number) => ((a % b) + b) % b;

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

const bump = (d: number, w: number) => Math.exp(-(d / w) * (d / w));

function hermite(start: number, speed: number, end: number, tIn: number): number {
  const t = clamp(tIn, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * start + (t3 - 2 * t2 + t) * WIPE * speed + (3 * t2 - 2 * t3) * end;
}

const passPosition = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(p, 0, 1));

/** A meter's RMS as dBFS. */
export const loudness = (rms: number) => 20 * Math.log10(Math.max(rms, 0) + 1e-6);

/** The prototype's level: −40 dB silent through −10 dB full. */
const fixedLevel = (db: number) => clamp((db + 40) / 30, 0, 1);

/** Slow auto level: the speaker's recent peak reads as full and the room as silent. */
class AutoLevel {
  peak = -30;
  room = -55;

  step(loudnessDb: number, h: number, release: number, noiseFloor: number): number {
    const db = Math.max(loudnessDb, -120);
    const follow = (value: number, target: number, time: number) =>
      value + (target - value) * (1 - Math.exp(-h / Math.max(time, 1e-3)));
    this.room = follow(this.room, db, db < this.room ? ROOM_FALL : ROOM_RISE);
    const lowest = Math.max(this.room, noiseFloor) + AUTO_MIN_SPAN;
    this.peak = db > this.peak ? follow(this.peak, db, AUTO_ATTACK) : follow(this.peak, lowest, release);
    this.peak = Math.max(this.peak, lowest);
    const low = Math.max(Math.max(this.room, noiseFloor) + AUTO_ROOM_MARGIN, this.peak - AUTO_RANGE);
    return clamp((db - low) / Math.max(this.peak - low, 1), 0, 1);
  }
}

class Voice {
  level = 0;
  reservoir = 0;
  energy = 0;
  kick = 0;
  kickVelocity = 0;
  band = 0;

  step(raw: number, h: number): void {
    const previous = this.level;
    this.level += (raw - this.level) * (1 - Math.exp(-h / (raw > this.level ? 0.035 : 0.095)));
    const rise = Math.max((this.level - previous) / h, 0);
    this.reservoir += (1.75 * this.level * this.level - this.reservoir / 1.8) * h;
    this.energy = 1 - Math.exp(-this.reservoir * 1.45);
    const w = TAU * 1.3;
    const z = 0.22;
    this.kickVelocity += (-w * w * this.kick - 2 * z * w * this.kickVelocity + 15 * rise + 2.2 * this.level) * h;
    this.kick += this.kickVelocity * h;
    this.band += (raw - this.band) * (1 - Math.exp(-h / (raw > this.band ? 0.025 : 0.14)));
  }
}

class Trace {
  envelope = 0;
  amplitude = 0;
  amplitudeVelocity = 0;
  glowFast = 0;
  glowSpring = 0;
  glowSpringVelocity = 0;
  glowSlow = 0;
  glow = 0;
  history = new Float32Array(HISTORY * 5);
  head = 0;

  constructor(public phases: number[]) {}

  tick(voice: Voice, live: number, speed: number, tuning: DotScopeTuning, h: number): void {
    const follow = (value: number, target: number, rise: number, fall: number) =>
      value + (target - value) * (1 - Math.exp(-h / (target > value ? rise : fall)));
    this.envelope = follow(this.envelope, voice.level, 0.022, tuning.release);
    const w = TAU * tuning.response;
    const z = 0.52;
    this.amplitudeVelocity += (-w * w * (this.amplitude - this.envelope) - 2 * z * w * this.amplitudeVelocity) * h;
    this.amplitude += this.amplitudeVelocity * h;
    this.glowFast = follow(this.glowFast, voice.level, 0.045, 0.13);
    const gw = TAU * 3.6;
    const gz = 0.5;
    this.glowSpringVelocity += (-gw * gw * (this.glowSpring - this.glowFast) - 2 * gz * gw * this.glowSpringVelocity) * h;
    this.glowSpring += this.glowSpringVelocity * h;
    this.glowSlow = follow(this.glowSlow, voice.level, 0.15, 0.7);
    const swell = 0.8 * Math.max(this.glowSpring - 0.25, 0) + 0.04 * Math.max(voice.kick, -0.5);
    this.glow = Math.min(Math.max(swell, 0) + 0.42 * this.glowSlow + 0.2 * voice.energy, 1.15) * live;
    const go = 0.6 + 1.1 * Math.min(this.envelope * 1.6, 1);
    this.phases = this.phases.map((phase, i) => (phase + h * TAU * SPEEDS[i] * go * speed) % TAU);
    const emphasis = 0.35 + 0.65 * Math.min(voice.band / (voice.band + 0.06), 2);
    const offset = this.head * 5;
    const amplitude = Math.max(this.amplitude, 0) * live;
    this.history[offset] = amplitude;
    BASE.forEach((base, c) => { this.history[offset + 1 + c] = amplitude * base * emphasis; });
    this.head = (this.head + 1) % HISTORY;
  }

  past(delay: number, channel: number): number {
    const d = Math.min(delay / STEP, HISTORY - 2);
    const i = Math.floor(d);
    const k = d - i;
    const a = (this.head + 2 * HISTORY - 1 - i) % HISTORY;
    const b = (a + HISTORY - 1) % HISTORY;
    return this.history[a * 5 + channel] * (1 - k) + this.history[b * 5 + channel] * k;
  }
}

/** Flow's bands or Pulse's rings, as light along the plate. */
type Working =
  | { kind: 'flow'; offset: number; spacing: number }
  | { kind: 'pulse'; time: number; period: number; speed: number };

function workingLight(working: Working, x: number, halfWidth: number): number {
  if (working.kind === 'flow') {
    const d = remEuclid(x - working.offset + working.spacing / 2, working.spacing) - working.spacing / 2;
    return bump(d, 7);
  }
  const { time, period, speed } = working;
  const d = Math.abs(x);
  let light = 0;
  for (let age = remEuclid(time, period); age * speed < halfWidth + 12 && age <= time + 1e-4; age += period) {
    const radius = age * speed;
    const fade = smoothstep(0, RING_BIRTH, age) * (1 - 0.6 * smoothstep(0.3 * halfWidth, halfWidth, radius));
    light += bump(d - radius, 6) * fade;
  }
  return Math.min(light, 1);
}

type Envelope =
  | { kind: 'enter'; reach: number; head: number; unfold: number }
  | { kind: 'process'; iron: number; front: number; head: number }
  | { kind: 'work'; working: Working; head: number; swell: number; halfWidth: number }
  | {
      kind: 'clear'; front: number; head: number; beam: number; beamAt: number; field: number;
      working: Working; glow: number; swell: number; halfWidth: number;
    };

interface Scan {
  helix: number;
  decay: number;
  tail: number;
  grid: number;
  envelope: Envelope;
}

/** (amplitude, brightness, swell) at `x`. */
function scanAt(envelope: Envelope, x: number): [number, number, number] {
  switch (envelope.kind) {
    case 'enter': {
      const { reach, head, unfold } = envelope;
      const d = Math.abs(x);
      const drawn = unfold * (1 - smoothstep(Math.max(reach - 14, 0), Math.max(reach, 0.001), d));
      const amplitude = drawn * (1 - smoothstep(Math.max(reach - 22, 0), Math.max(reach - 3, 0.001), d));
      const beam = head * bump(d - reach, 6);
      const swell = 1.8 * unfold * (head / 2.8) * bump(d - Math.max(reach - 14, 0), 14);
      return [amplitude, amplitude + beam, swell];
    }
    case 'process':
      return [envelope.iron, envelope.iron + envelope.head * bump(x - envelope.front, 5), 0];
    case 'work': {
      const light = workingLight(envelope.working, x, envelope.halfWidth);
      return [1, 1 + envelope.head * light, envelope.swell * light];
    }
    case 'clear': {
      const e = envelope;
      const d = Math.abs(x);
      const keep = e.field * smoothstep(e.front - 12, e.front - 2, d);
      const light = workingLight(e.working, x, e.halfWidth);
      return [
        keep,
        keep * (1 + e.glow * light) + e.head * bump(d - e.front, 6) + e.beam * bump(x - e.beamAt, 5),
        keep * e.swell * light,
      ];
    }
  }
}

export class Scope {
  readonly tuning: DotScopeTuning;
  private stage: Stage = 'recording';
  private elapsed = 0;
  private speedAtDone = 0;
  private doneFrom = 0;
  private flowOffset = 0;
  private flowTurn = 0;
  private auto = new AutoLevel();
  private voices = [new Voice(), new Voice()];
  private traces = [new Trace([0.1, 1.7, 3.3, 4.6]), new Trace([2.4, 0.6, 5.1, 1.9])];
  private live = 0;
  private carrier = 0;
  private time = 0;
  private steps = 0;
  private pending = 0;
  private reduceMotion = false;
  readonly columns: number;
  readonly rows: number;
  private head: [Float32Array, Float32Array];
  private tail: [Float32Array, Float32Array];
  /** (brightness, freshness) per dot, row by row: [b0, f0, b1, f1, …]. */
  readonly dots: Float32Array;
  private ys: [Float32Array, Float32Array];
  private brightness: [Float32Array, Float32Array];
  private grid = 0;
  private width = new Spring(START_WIDTH);
  private opacity = new Spring(0);
  private scale = new Spring(HIDDEN_SCALE);
  private softness = new Spring(HIDDEN_SOFTNESS);
  private cool = new Spring(0);
  private fail = new Spring(0);

  constructor(tuning: DotScopeTuning = DOT_SCOPE_CONFIG.tuning) {
    this.tuning = tuning;
    this.columns = tuning.columns;
    this.rows = tuning.rows;
    const dots = this.columns * this.rows;
    const samples = (this.columns - 1) * SAMPLES_PER_COLUMN + 1;
    this.head = [new Float32Array(dots), new Float32Array(dots)];
    this.tail = [new Float32Array(dots), new Float32Array(dots)];
    this.dots = new Float32Array(dots * 2);
    this.ys = [new Float32Array(samples), new Float32Array(samples)];
    this.brightness = [new Float32Array(samples), new Float32Array(samples)];
  }

  pose(): Pose {
    return {
      width: Math.max(this.width.x, this.tuning.height),
      height: this.tuning.height,
      opacity: clamp(this.opacity.x, 0, 1),
      scale: Math.max(this.scale.x, 0.01),
      softness: clamp(this.softness.x, 0, HIDDEN_SOFTNESS),
      cool: clamp(this.cool.x, 0, 1),
      fail: clamp(this.fail.x, 0, 1),
      glow: ((this.traces[0].glow + this.traces[1].glow) / 2) * this.tuning.glow,
      grid: this.grid,
      live: this.live,
    };
  }

  /** Whether the scope has faded out after being hidden. */
  settled(): boolean {
    return this.opacity.target === 0 && this.opacity.x < 0.002;
  }

  /** Advances by `dt` seconds in fixed 240 Hz steps. */
  advance(dt: number, frame: Frame): void {
    if (frame.stage !== this.stage) {
      if (frame.stage === 'done') this.armDone();
      if (frame.stage === 'processing') this.flowOffset = -this.width.x / 2 - 4;
      this.stage = frame.stage;
      this.elapsed = 0;
    }
    this.reduceMotion = frame.reduceMotion;
    this.pending += clamp(dt, 0, 0.25);
    while (this.pending >= STEP) {
      this.pending -= STEP;
      this.step(frame);
    }
  }

  private step(frame: Frame): void {
    const h = STEP;
    const tuning = this.tuning;
    const recording = this.stage === 'recording' && frame.visible;
    let level = 0;
    if (recording) {
      const raw = tuning.autoLevel
        ? this.auto.step(frame.loudness, h, tuning.autoRelease, tuning.noiseFloor)
        : fixedLevel(frame.loudness);
      level = clamp(raw * tuning.gain, 0, 1);
    }
    this.voices[0].step(level, h);
    this.voices[1].step(level * 0.85, h);
    this.live += ((recording ? 1 : 0) - this.live) * (1 - Math.exp(-h / 0.55));
    const speed = frame.reduceMotion ? 0 : tuning.braidSpeed;
    this.traces.forEach((trace, k) => trace.tick(this.voices[k], this.live, speed, tuning, h));
    const energy = Math.max(this.voices[0].energy, this.voices[1].energy);
    const working = this.stage === 'processing' || this.stage === 'done';
    const flowing = working && tuning.processing === 'flow';
    this.flowTurn += ((flowing ? 1 : 0) - this.flowTurn) * (1 - Math.exp(-h / 0.25));
    if (working) this.flowOffset += this.flowSpeed() * h;
    const rest = CARRIER_REST + 0.22 * energy;
    const turn = rest + (this.flowTurnHz() - rest) * this.flowTurn;
    this.carrier = (this.carrier + h * TAU * turn * speed) % TAU;
    this.stepSprings(frame, h);

    this.elapsed += h;
    this.time += h;
    this.steps += 1;
    if (this.steps % 2 === 0) this.beam(2 * h);
  }

  private stepSprings(frame: Frame, h: number): void {
    const tuning = this.tuning;
    const width = this.stage === 'recording'
      ? tuning.width
      : this.stage === 'failed' ? this.width.target : tuning.processingWidth;
    const cool = this.stage === 'processing' || this.stage === 'done' ? 1 : 0;
    const fail = this.stage === 'failed' ? 1 : 0;
    const shown = frame.visible ? 1 : 0;
    const fade: Spec = { duration: tuning.transition, bounce: 0 };
    const bouncy: Spec = { duration: tuning.transition, bounce: tuning.bounce };
    if (frame.reduceMotion) {
      this.width.jump(width);
      this.scale.jump(1);
      this.softness.jump(0);
      this.opacity.stepTo(shown, DOT_SCOPE_CONFIG.reducedFade, h);
      this.cool.stepTo(cool, DOT_SCOPE_CONFIG.reducedFade, h);
      this.fail.stepTo(fail, DOT_SCOPE_CONFIG.reducedFade, h);
      return;
    }
    this.width.stepTo(width, bouncy, h);
    this.opacity.stepTo(shown, fade, h);
    this.scale.stepTo(frame.visible ? 1 : HIDDEN_SCALE, bouncy, h);
    this.softness.stepTo(frame.visible ? 0 : HIDDEN_SOFTNESS, fade, h);
    this.cool.stepTo(cool, fade, h);
    this.fail.stepTo(fail, fade, h);
  }

  private workPeriod(): number {
    return 2 * Math.max(this.tuning.shimmerPass, 0.05);
  }

  private flowSpacing(): number {
    return FLOW_SPACING * this.tuning.processingWidth;
  }

  private flowSpeed(): number {
    return this.flowSpacing() / this.workPeriod();
  }

  private flowTurnHz(): number {
    return (this.flowSpeed() * this.tuning.helixCycles) / Math.max(this.width.x, 1);
  }

  private pulseSpeed(): number {
    return (this.tuning.processingWidth / 2 + 12) / (1.4 * this.workPeriod());
  }

  private working(time: number): Working {
    if (this.tuning.processing === 'pulse') {
      return { kind: 'pulse', time, period: this.workPeriod(), speed: this.pulseSpeed() };
    }
    return { kind: 'flow', offset: this.flowOffset, spacing: this.flowSpacing() };
  }

  private armDone(): void {
    this.speedAtDone = 1.5 * this.pulseSpeed();
    this.doneFrom = this.stage === 'processing' ? this.elapsed : 0;
  }

  private processHead(elapsed: number): number {
    const pass = Math.max(this.tuning.shimmerPass, 0.05);
    return (2.2 + Math.abs(Math.sin(Math.PI * (elapsed / pass + 0.5)))) * smoothstep(0, 0.14, elapsed) * this.tuning.shimmer;
  }

  private processFront(elapsed: number, width: number): number {
    const pass = Math.max(this.tuning.shimmerPass, 0.05);
    const position = 0.5 - 0.5 * Math.cos(Math.PI * (elapsed / pass + 0.5));
    return -width / 2 + PASS_INSET + (width - 2 * PASS_INSET) * position;
  }

  private scan(width: number): Scan {
    const e = this.elapsed;
    const still: Scan = { helix: 1, decay: 1, tail: 1, grid: 1, envelope: { kind: 'enter', reach: 1e4, head: 0, unfold: 1 } };
    if (this.stage === 'failed' || this.reduceMotion) return still;
    if (this.stage === 'recording') {
      return {
        helix: 1, decay: 1, tail: 1, grid: Math.min(e / 0.3, 1),
        envelope: {
          kind: 'enter',
          reach: (width / 2 + 12) * passPosition(e / ENTER),
          head: 2.8 * (1 - smoothstep(0.08, ENTER, e)),
          unfold: smoothstep(0, 0.1, e),
        },
      };
    }
    if (this.stage === 'processing' && this.tuning.processing !== 'sweep') {
      const enter = smoothstep(0, 0.35, e);
      return {
        helix: 1 + (WORK_HELIX - 1) * enter, decay: 1, tail: 1, grid: 1,
        envelope: {
          kind: 'work',
          working: this.working(e),
          head: 2.5 * smoothstep(0.05, 0.3, e) * this.tuning.shimmer,
          swell: 0.9 * enter,
          halfWidth: width / 2,
        },
      };
    }
    if (this.stage === 'done') return this.doneScan(width, e);
    const iron = 1 - smoothstep(0, 0.28, e);
    return {
      helix: iron, decay: 1, tail: 1, grid: 1,
      envelope: { kind: 'process', iron, front: this.processFront(e, width), head: this.processHead(e) },
    };
  }

  private doneScan(width: number, e: number): Scan {
    const sweep = this.tuning.processing === 'sweep';
    return {
      helix: sweep ? 0 : WORK_HELIX,
      decay: 1 - 0.6 * smoothstep(0, 0.12, e),
      tail: 1 - smoothstep(0, 0.15, e),
      grid: 1 - smoothstep(0.2, 0.4, e),
      envelope: {
        kind: 'clear',
        front: hermite(0, this.speedAtDone, width / 2 + 8, e / WIPE),
        head: 2.8 * smoothstep(0, 0.04, e) * (1 - smoothstep(0.22, 0.32, e)),
        beam: sweep && this.doneFrom > 0 ? this.processHead(this.doneFrom + e) * (1 - smoothstep(0, BEAM_FADE, e)) : 0,
        beamAt: this.processFront(this.doneFrom + e, width),
        field: sweep ? 0 : 1,
        working: this.working(this.doneFrom + e),
        glow: (sweep ? 0 : 2.5) * this.tuning.shimmer * (1 - smoothstep(0, 0.18, e)),
        swell: 0.9,
        halfWidth: width / 2,
      },
    };
  }

  /** Draws both traces into the dot field and decays the phosphor. */
  private beam(hb: number): void {
    const { columns, rows } = this;
    const sub = SAMPLES_PER_COLUMN;
    const samples = (columns - 1) * sub + 1;
    const width = Math.max(this.width.x, this.tuning.height);
    const scan = this.scan(width);
    this.grid = scan.grid;
    const mid = (rows - 1) / 2;
    const half = mid - 0.55;
    const breath = this.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin((this.time * TAU) / BREATH_PERIOD);
    const rest = (0.55 + 0.35 * breath) * (0.4 + 0.6 * this.live) * scan.helix;
    for (let k = 0; k < 2; k++) this.traceSamples(k, samples, width, half, mid, rest, scan);
    this.lightDots(hb, scan, samples);
  }

  private traceSamples(k: number, samples: number, width: number, half: number, mid: number, rest: number, scan: Scan): void {
    const { columns, tuning } = this;
    const sub = SAMPLES_PER_COLUMN;
    const trace = this.traces[k];
    const sign = k === 0 ? 1 : -1;
    const ys = this.ys[k];
    const brightness = this.brightness[k];
    const halfWidth = width / 2;
    for (let s = 0; s < samples; s++) {
      const x = (s / sub - (columns - 1) / 2) * tuning.spacing;
      if (Math.abs(x) > halfWidth) {
        ys[s] = mid;
        brightness[s] = 0;
        continue;
      }
      const [amplitude, bright, swell] = scanAt(scan.envelope, x);
      const own = Math.abs(x);
      const xn = (x + halfWidth) / width;
      const ends = Math.min(
        smoothstep(-halfWidth + 3, -halfWidth + 17, x),
        smoothstep(-halfWidth + 3, -halfWidth + 17, -x),
      );
      const reach = 1 - 0.8 * smoothstep(14, halfWidth, own);
      const delay = own / tuning.historySpeed;
      const a = trace.past(delay, 0);
      let spread = 0;
      SPATIAL.forEach((spatial, c) => { spread += trace.past(delay, 1 + c) * Math.sin(TAU * spatial * xn - trace.phases[c]); });
      const helix = (rest + swell + half * 0.55 * a * reach) * Math.sin(TAU * tuning.helixCycles * xn - this.carrier);
      const y = half * Math.tanh((helix + half * 0.7 * spread * reach) / half) * ends * amplitude;
      ys[s] = mid - sign * y;
      const spatialB = (0.3 + 0.7 * Math.min(a * 1.8, 1)) * (0.45 + 0.55 * ends);
      brightness[s] = spatialB * amplitude + 0.36 * Math.max(bright - amplitude, 0);
    }
    for (let s = 0; s < samples; s++) {
      const slope = ((ys[Math.min(s + 1, samples - 1)] - ys[Math.max(s - 1, 0)]) * sub) / 2;
      brightness[s] *= 1 - 0.55 + 0.55 / Math.sqrt(1 + 0.22 * slope * slope);
    }
  }

  private lightDots(hb: number, scan: Scan, samples: number): void {
    const { columns, rows } = this;
    const sub = SAMPLES_PER_COLUMN;
    const headKeep = Math.exp(-hb / (PHOSPHOR_HEAD * scan.decay));
    const tailKeep = Math.exp(-hb / (this.tuning.phosphor * scan.decay));
    const dx = 1 / sub;
    for (let i = 0; i < columns; i++) {
      const s0 = Math.max(i - 3, 0) * sub;
      const s1 = Math.min((i + 3) * sub, samples - 1);
      for (let j = 0; j < rows; j++) {
        const n = j * columns + i;
        let now = 0;
        let total = 0;
        const lit = [0, 0];
        for (let k = 0; k < 2; k++) {
          const ys = this.ys[k];
          let best = Number.MAX_VALUE;
          let nearest = i * sub;
          for (let s = s0; s < s1; s++) {
            const ay = ys[s];
            const dy = ys[s + 1] - ay;
            const px = i - s * dx;
            const py = j - ay;
            const t = clamp((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1);
            const ex = px - t * dx;
            const ey = py - t * dy;
            const d2 = ex * ex + ey * ey;
            if (d2 < best) {
              best = d2;
              nearest = s;
            }
          }
          const b = this.brightness[k][nearest];
          const onBeam = Math.exp(-best / 0.25);
          const instant = Math.min(onBeam + 0.5 * Math.exp(-Math.sqrt(best) / 0.8), 1.2) * b;
          const core = onBeam * b;
          this.head[k][n] = Math.max(this.head[k][n] * headKeep, core);
          this.tail[k][n] = Math.max(this.tail[k][n] * tailKeep, core);
          const light = Math.max(instant, this.head[k][n], 0.55 * scan.tail * this.tail[k][n]);
          lit[k] = light;
          now += instant;
          total += light;
        }
        const power = 1 - (1 - Math.min(lit[0], 1)) * (1 - Math.min(lit[1], 1));
        this.dots[n * 2] = clamp(power, 0, 1);
        this.dots[n * 2 + 1] = Math.min(now / Math.max(total, 1e-4), 1);
      }
    }
  }
}
