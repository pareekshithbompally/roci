/** The kit's motion: framer-motion transitions made from the one vocabulary (`MOTION`, motion.config.ts). Nothing else in
 *  the app writes a duration, curve or spring. Reduce Motion turns every motion into one short fade. */

import { useReducedMotion } from 'framer-motion';
import type { Transition } from 'framer-motion';
import { MOTION } from '@config/motion.config';
import type { MotionName, SpringName } from '@config/motion.config';

export type { MotionName };

const REDUCED: Transition = { duration: MOTION.reduced };

/** The spring `name`, starting at `velocity` (units per second of whatever it moves: a finger's release speed). */
export function spring(name: SpringName, velocity?: number): Transition {
  return { type: 'spring', ...MOTION.spring[name], ...(velocity !== undefined && { velocity }) };
}

const TWEENS: Record<Exclude<MotionName, SpringName>, Transition> = {
  fadeIn: { duration: MOTION.fade.in, ease: MOTION.curve.in },
  fadeOut: { duration: MOTION.fade.out, ease: MOTION.curve.out },
  quick: { duration: MOTION.quick, ease: MOTION.curve.in },
};

const isSpring = (name: MotionName): name is SpringName => name in MOTION.spring;

/** The transition for `name`; under Reduce Motion, the short fade. `delay` places it in a choreography (seconds). */
export function motionFor(name: MotionName, reduce = false, delay?: number): Transition {
  const base = reduce ? REDUCED : isSpring(name) ? spring(name) : TWEENS[name];
  return delay ? { ...base, delay } : base;
}

/** `motionFor`, following the system's Reduce Motion. */
export function useMotion(): (name: MotionName, delay?: number) => Transition {
  const reduce = useReducedMotion() ?? false;
  return (name, delay) => motionFor(name, reduce, delay);
}
