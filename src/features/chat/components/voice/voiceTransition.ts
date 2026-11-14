/**
 * Voice Transition — the single shared choreography for the chat voice pill.
 *
 * One morphing frame, two mirrored beats:
 *   forward:  the box fades flat out while the pill springs up into its slot.
 *   return:   the pill sinks back into the box while the box fades flat in,
 *             then titles above and buttons below land together as beat two.
 *
 * Every transition here is a tween. Springs overshoot their rest value and
 * layout feedback re-measures mid-flight — both read as bounce and stick
 * against a morphing frame, so neither is allowed in this module.
 */

import type { Transition } from 'framer-motion';
import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';

/** Ease-out for entrances (fast attack, soft landing). */
export const VOICE_EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];
/** Ease-in for exits (gentle release, decisive departure). */
export const VOICE_EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1];

/**
 * Handoff beat (seconds) after the transcription lands before the box
 * expands back. Canonical value lives in the dot-scope tuning; this
 * re-export keeps every consumer on the same beat.
 */
export const VOICE_HANDOFF_S = DOT_SCOPE_CONFIG.composer.handoff;

/** Minimum mic-press → recording-UI delay (ms): the pill enter (0.3s) plus a
    beat of margin, so the recording flip never lands mid-enter. Capture
    itself starts immediately — only the UI flip waits. */
export const VOICE_ENTER_BEAT_MS = 350;

/** Seconds. Enter and return use the same magnitudes — mirrored, not matched. */
export const VOICE_TIMING = {
  /** Pill scales up into its slot on capture start. */
  pillIn: 0.3,
  /** Pill sinks back into the box on return (mirror of pillIn). */
  pillOut: 0.3,
  /** Composer fades flat in once the pill has cleared. */
  composerIn: 0.3,
  /** Offset so the frame lands before the content fills it. */
  composerInDelay: 0.1,
  /** Composer fades flat out on capture start (mirror of composerIn). */
  composerOut: 0.15,
  /** Titles above + buttons below land as the second beat. */
  chromeIn: 0.3,
  /** Offset so the pill owns the return before the chrome trails in. */
  chromeInDelay: 0.6,
  /** Stop/Pause ⇄ X swap inside the reserved slot. */
  controlIn: 0.2,
  controlOut: 0.15,
} as const;

type VoicePhase =
  | 'pillIn'
  | 'pillOut'
  | 'composerIn'
  | 'composerOut'
  | 'controlIn'
  | 'controlOut';

const PHASE_DURATION: Record<VoicePhase, number> = {
  pillIn: VOICE_TIMING.pillIn,
  pillOut: VOICE_TIMING.pillOut,
  composerIn: VOICE_TIMING.composerIn,
  composerOut: VOICE_TIMING.composerOut,
  controlIn: VOICE_TIMING.controlIn,
  controlOut: VOICE_TIMING.controlOut,
};

const PHASE_EASE: Record<VoicePhase, [number, number, number, number]> = {
  pillIn: VOICE_EASE_OUT,
  pillOut: VOICE_EASE_IN,
  composerIn: VOICE_EASE_OUT,
  composerOut: VOICE_EASE_IN,
  controlIn: VOICE_EASE_OUT,
  controlOut: VOICE_EASE_IN,
};

const PHASE_DELAY: Partial<Record<VoicePhase, number>> = {
  composerIn: VOICE_TIMING.composerInDelay,
  controlIn: 0.1,
};

/**
 * Transition for one choreography phase. Under prefers-reduced-motion every
 * phase collapses to a plain fast fade — same sequence, no travel.
 */
export function voiceTransition(reduceMotion: boolean, phase: VoicePhase): Transition {
  if (reduceMotion) return { duration: 0.16 };
  const transition: Transition = {
    duration: PHASE_DURATION[phase],
    ease: PHASE_EASE[phase],
  };
  const delay = PHASE_DELAY[phase];
  if (delay) transition.delay = delay;
  return transition;
}

/**
 * Second-beat transition for the titles above and buttons below the
 * composer. Delayed only on the pass where the pill hands back, so the
 * chrome trails the pill fade instead of popping in first; first paint
 * and every other render enter immediately.
 */
export function voiceChromeEnter(returning: boolean, reduceMotion: boolean): Transition {
  if (reduceMotion) return { duration: 0.16 };
  if (returning) {
    return {
      delay: VOICE_TIMING.chromeInDelay,
      duration: VOICE_TIMING.chromeIn,
      ease: VOICE_EASE_OUT,
    };
  }
  return { duration: VOICE_TIMING.chromeIn, ease: VOICE_EASE_OUT };
}

/** Pill content: resting pose. */
export const voicePillSettled = { opacity: 1, scale: 1, y: 0 } as const;
/** Pill content: collapsed below its slot — enter-from and exit-to pose. */
export const voicePillCollapsed = { opacity: 0, scale: 0.55, y: 14 } as const;
/** Chrome (titles, chips): gentle rise. */
export const voiceChromeHidden = { opacity: 0, y: 8 } as const;
export const voiceChromeSettled = { opacity: 1, y: 0 } as const;
