/** Shared voice-pill choreography: which motion each part takes (the app's one vocabulary, `motionFor`) and when, as beats.
 *  The voice area and the composer it stands in for cross over together on the `soft` motion, in and out, so neither
 *  pops; the line's end beats (clock, buttons, messages) fade. */

import type { MotionProps, Transition } from 'framer-motion';
import { motionFor } from '@shared/ui';
import type { MotionName } from '@shared/ui';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { MOTION } from '@config/motion.config';

const { beats: VOICE_BEATS, pill: PILL, beat: BEAT, chrome: CHROME } = ANIMATION_CONFIG.voice;

/** Min mic-press → recording-UI delay (ms): the pill's entrance (`softIn`), so the flip never lands mid-enter; capture
 *  starts at once. */
export const VOICE_ENTER_BEAT_MS = MOTION.soft.in * 1000;

type VoicePhase = 'pillIn' | 'pillOut' | 'composerIn' | 'composerOut' | 'controlIn' | 'controlOut';

const PHASE_MOTION: Record<VoicePhase, MotionName> = {
  pillIn: 'softIn',
  pillOut: 'softOut',
  composerIn: 'softIn',
  composerOut: 'softOut',
  controlIn: 'fadeIn',
  controlOut: 'fadeOut',
};

const PHASE_BEAT: Partial<Record<VoicePhase, number>> = { controlIn: VOICE_BEATS.controlIn };

/** Transition for one phase; Reduce Motion makes every phase the one short fade. */
export function voiceTransition(reduceMotion: boolean, phase: VoicePhase): Transition {
  return motionFor(PHASE_MOTION[phase], reduceMotion, PHASE_BEAT[phase]);
}

/** Second-beat transition for surrounding chrome, delayed only on the pass where the pill hands back. */
function voiceChromeEnter(returning: boolean, reduceMotion: boolean): Transition {
  return motionFor('fadeIn', reduceMotion, returning ? VOICE_BEATS.chromeIn : undefined);
}

export const voicePillSettled = PILL.settled;
export const voicePillCollapsed = PILL.collapsed;
export const voiceFaded = PILL.faded;
export const voicePillLifted = PILL.lifted;
export const voiceBeatShown = BEAT.shown;
export function voiceBeatAway(side: 'in' | 'out', reduceMotion: boolean) {
  if (reduceMotion) return BEAT.faded;
  return side === 'in' ? BEAT.enterFrom : BEAT.leaveTo;
}

export type ChromeSide = 'above' | 'below';

/** Motion for the chrome around the composer while dictating: it steps aside as the pill rises and trails back in once the
 *  pill has handed back. One choreography for home and an open chat. */
export interface VoiceChrome {
  /** Chrome that stays mounted (it only fades), so nothing reflows under the pill. */
  stay: (side: ChromeSide) => MotionProps;
  /** Chrome that unmounts while the pill is up (inside AnimatePresence). */
  presence: (side: ChromeSide) => MotionProps;
}

export function voiceChrome(active: boolean, returning: boolean, reduceMotion: boolean): VoiceChrome {
  const away = (side: ChromeSide) => (reduceMotion ? PILL.faded : CHROME[side]);
  const leave = motionFor('fadeOut', reduceMotion);
  const enter = voiceChromeEnter(returning, reduceMotion);
  return {
    stay: (side) => ({ initial: false, animate: active ? away(side) : CHROME.settled, transition: active ? leave : enter }),
    presence: (side) => ({ initial: away(side), animate: CHROME.settled, exit: { ...away(side), transition: leave }, transition: enter }),
  };
}
