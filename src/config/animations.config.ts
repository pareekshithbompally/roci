/** Animation timings and framer-motion transitions read outside CSS; kit open/close motion lives in tailwind.config.js. */

export const ANIMATION_CONFIG = {
  /** The startup splash fading out (ms, CSS easing). */
  transition: {
    opacity: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  /** A view or a block of one mounting or leaving (framer-motion seconds): a short fade only — no slide, scale or spring. */
  view: {
    hidden: { opacity: 0 },
    shown: { opacity: 1 },
    enter: { duration: 0.18, ease: [0, 0, 0.2, 1] as const },
    exit: { duration: 0.12, ease: [0.4, 0, 1, 1] as const },
  },

  /** The Mac activity tray opening and closing at the sidebar's foot (framer-motion seconds). */
  activityTray: { duration: 0.2, ease: 'easeInOut' as const },

  /** A pushed screen sliding over the one below it (kit `NavStack`, framer-motion seconds; iOS navigation curve). */
  navigation: {
    push: { duration: 0.35, ease: [0.32, 0.72, 0, 1] as const },
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
    /** Linear, so bursts of updates read as one steady ramp instead of a stop-start ease per update. */
    fill: { duration: 0.5, ease: 'linear' },
    sweep: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
    appear: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
  },

  /** Disclosure open/close (framer-motion, seconds): height and fade together. */
  disclosure: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
} as const;
