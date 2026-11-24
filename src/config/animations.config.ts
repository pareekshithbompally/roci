/** Animation timings and framer-motion transitions read outside CSS; kit open/close motion lives in tailwind.config.js. */

import { platform } from '@platform/index';

export const ANIMATION_CONFIG = {
  /** The startup splash fading out (ms, CSS easing). */
  transition: {
    opacity: {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  /** A view mounting or leaving (framer-motion seconds): the kit's `animate-fade-in` timing (150ms out-ease in, 120ms in-ease out); nothing inside a view animates in. */
  view: {
    hidden: { opacity: 0 },
    shown: { opacity: 1 },
    enter: { duration: 0.15, ease: 'easeOut' as const },
    exit: { duration: 0.12, ease: 'easeIn' as const },
  },

  /** The Mac activity tray opening and closing at the sidebar's foot (framer-motion seconds). */
  activityTray: { duration: 0.2, ease: 'easeInOut' as const },

  /** A pushed screen sliding over the one below it (kit `NavStack`, framer-motion seconds; iOS navigation curve). */
  navigation: {
    push: { duration: 0.35, ease: [0.32, 0.72, 0, 1] as const },
  },

  chat: {
    /** Shared-element id: the composer glides from the landing page to the bottom of the chat */
    /** The glide is a Mac flourish measured on the JS thread; on touch the composer simply stays at the keyboard (iOS),
     *  so neither the shared id nor layout measuring is set there. */
    composerLayoutId: platform.hasTouchScreen ? undefined : 'chat-composer',
    composerLayout: platform.hasTouchScreen ? false : ('position' as const),
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

  /** iPhone search (framer-motion, seconds): the sidebar's magnifier and the search field share one layout id, so the button
   *  grows into the field on the iOS curve; the screen fades in under it and the results rise a beat later. */
  search: {
    morphId: 'search-field',
    morph: { duration: 0.5, ease: [0.32, 0.72, 0, 1] as const },
    fade: { duration: 0.25, ease: 'easeOut' as const },
    results: { duration: 0.35, delay: 0.15, ease: [0.32, 0.72, 0, 1] as const },
    hidden: { opacity: 0 },
    shown: { opacity: 1, y: 0 },
    resultsHidden: { opacity: 0, y: 8 },
  },

  /** A round button changing what it does in place (the composer's record ⇄ send ⇄ stop): the old glyph shrinks and fades
   *  as the new one grows in, while the fill blends (framer-motion, seconds; iOS curve). */
  glyphSwap: {
    transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const },
    hidden: { opacity: 0, scale: 0.5 },
    shown: { opacity: 1, scale: 1 },
  },

  /** Disclosure open/close (framer-motion, seconds): height and fade together. */
  disclosure: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
} as const;
