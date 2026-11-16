/** Animation timings and framer-motion transitions read outside CSS; kit open/close motion lives in tailwind.config.js. */

export const ANIMATION_CONFIG = {
  /** The startup splash fading out (ms, CSS easing). */
  transition: {
    opacity: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  timer: {
    /** Rotate the composer's placeholder hints (gentle, long interval). */
    placeholderCycle: 30000,
  },

  chat: {
    /** Shared-element id: the composer glides from the landing page to the bottom of the chat */
    composerLayoutId: 'chat-composer',
    /** framer-motion `layoutDependency` per composer host; values must differ or framer skips the shared glide. */
    composerLayoutDependency: { idle: 'idle', chat: 'chat' },
    /** Composer glide (framer-motion, seconds) — standard easeInOut */
    composerGlide: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
  },

  /** Progress bar (framer-motion, seconds): the fill easing to its value, the indeterminate sweep, a compact bar fading in. */
  progress: {
    fill: { duration: 0.3, ease: 'easeOut' },
    sweep: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
    appear: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
  },

  /** Disclosure open/close (framer-motion, seconds): height and fade together. */
  disclosure: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
} as const;
