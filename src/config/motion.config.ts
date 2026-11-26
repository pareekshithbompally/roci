/** The app's one motion vocabulary (docs/plans/IN-PROGRESS/ios-motion-and-haptics.md). Every duration, curve and spring in
 *  the app comes from here: framer-motion through the kit (`@shared/ui` motion), CSS through Tailwind and the `--motion-*`
 *  variables it writes (tailwind.config.js). Plain values only: Tailwind reads this file at build time. */

/** A spring as framer-motion takes it: how long it looks (seconds) and how much it overshoots (0 = none). */
export interface SpringSpec {
  visualDuration: number;
  bounce: number;
}

export type Curve = readonly [number, number, number, number];

export const MOTION = {
  spring: {
    /** A sheet a finger lets go of (react-modal-sheet): it carries on at the finger's speed. */
    follow: { visualDuration: 0.28, bounce: 0 },
    /** Anything that slides: a screen pushed or popped, a full-screen page rising, the sidebar, a swipe back let go. */
    move: { visualDuration: 0.28, bounce: 0 },
    /** Something small changing in place, with a touch of life: a menu popping from its button, a glyph swap. */
    pop: { visualDuration: 0.25, bounce: 0.2 },
  },
  /** Appearing and disappearing (seconds): in on the iOS curve, out on an accelerating one. Everything leaving fades out,
   *  so an exit is over when it looks over (a spring's settling tail would hold up what waits for it). */
  fade: { in: 0.15, out: 0.12 },
  /** The composer riding the keyboard (seconds, `curve.in`): as long as iOS's own keyboard move, so the two land together. */
  keyboard: 0.25,
  /** A control answering the pointer (hover, press, focus colour), seconds. */
  quick: 0.15,
  /** iPhone's sidebar comes forward from under the main view: from `pane` of its size and `paneDim` of its opacity. */
  depth: { pane: 0.9, paneDim: 0.55 },
  /** Reduce Motion: every motion is this one short fade, seconds. */
  reduced: 0.16,
  curve: {
    /** iOS's presentation curve: fast attack, long soft landing. */
    in: [0.32, 0.72, 0, 1],
    /** Leaving: a gentle start and a decisive end. */
    out: [0.4, 0, 1, 1],
    /** Ambient loops (a breathing glow, a pulse): even in and out. */
    loop: [0.4, 0, 0.6, 1],
  },
  /** Ambient, looping or one-off decorative motion (seconds): not UI movement, so it isn't a spring or a fade. */
  ambient: {
    shimmer: 2,
    aiSweep: 1.6,
    aiArrive: 1.8,
    glowDrift: [22, 28, 36],
    /** A finished reply's words fading in. */
    textReveal: 0.5,
    progressFill: 0.5,
    progressSweep: 1.5,
  },
} as const satisfies {
  spring: Record<string, SpringSpec>;
  curve: Record<string, Curve>;
  [key: string]: unknown;
};

export type SpringName = keyof typeof MOTION.spring;
/** Every motion by name: a spring, a fade in or out, or the pointer's quick answer. Config names a motion; the kit
 *  (`motionFor`) turns the name into a transition. */
export type MotionName = SpringName | 'fadeIn' | 'fadeOut' | 'quick';
