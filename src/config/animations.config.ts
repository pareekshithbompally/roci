/** What animates and in what order (poses, shared-element ids, choreography offsets). How it moves is named here and comes
 *  from the one vocabulary (motion.config.ts) through the kit's `motionFor`; no duration or curve is written here. */

import { platform } from '@platform/index';
import type { MotionName } from '@config/motion.config';

export const ANIMATION_CONFIG = {
  /** A view mounting or leaving: a plain fade; nothing inside a view animates in. */
  view: {
    hidden: { opacity: 0 },
    shown: { opacity: 1 },
    enter: 'fadeIn' satisfies MotionName,
    exit: 'fadeOut' satisfies MotionName,
  },

  /** The Mac activity tray opening and closing at the sidebar's foot. */
  activityTray: 'move' satisfies MotionName,

  chat: {
    /** Shared-element id: the composer glides from the landing page to the bottom of the chat */
    /** The glide is a Mac flourish measured on the JS thread; on touch the composer simply stays at the keyboard (iOS),
     *  so neither the shared id nor layout measuring is set there. */
    composerLayoutId: platform.hasTouchScreen ? undefined : 'chat-composer',
    composerLayout: platform.hasTouchScreen ? false : ('position' as const),
    /** framer-motion `layoutDependency` per composer host; values must differ or framer skips the shared glide. */
    composerLayoutDependency: { idle: 'idle', chat: 'chat' },
    composerGlide: 'move' satisfies MotionName,
  },

  /** iPhone search: the sidebar's magnifier and the search field share one layout id, so the button grows into the field;
   *  the screen fades in under it and the results rise a beat later. Closing, it all fades out in place (iOS's Cancel). */
  search: {
    /** The shared layout id for one search (its round, searchStore). */
    morphId: (round: number) => `search-field-${round}`,
    morph: 'move' satisfies MotionName,
    /** Seconds after the screen starts appearing that the results rise. */
    resultsDelay: 0.15,
    hidden: { opacity: 0 },
    shown: { opacity: 1, y: 0 },
    resultsHidden: { opacity: 0, y: 8 },
  },

  /** A round button changing what it does in place (the composer's record ⇄ send ⇄ stop): the old glyph shrinks and fades
   *  as the new one grows in, while the fill blends. */
  glyphSwap: {
    motion: 'pop' satisfies MotionName,
    hidden: { opacity: 0, scale: 0.5 },
    shown: { opacity: 1, scale: 1 },
  },

  /** Disclosure open/close: height and fade together. */
  disclosure: 'move' satisfies MotionName,

  /** Dictation (the composer's voice pill, docs/plans/IN-PROGRESS/dictation-flow.md): its poses, and the beats (seconds
   *  after a phase starts) of what waits for what. */
  voice: {
    beats: {
      /** The composer comes back once the pill has started to clear. */
      composerIn: 0.1,
      /** The old end beat has gone before the new one comes in. */
      controlIn: 0.1,
      /** The pill owns the return before the chrome around the composer trails in. */
      chromeIn: 0.6,
    },
    pill: {
      settled: { opacity: 1, scale: 1, y: 0 },
      /** Just below its slot: where it enters from, and where it goes when the words go into the box. */
      collapsed: { opacity: 0, scale: 0.97, y: 10 },
      /** Toward the conversation: where it goes when the words are sent, rising with the message they became. */
      lifted: { opacity: 0, scale: 1, y: -16 },
      /** Reduce Motion: no travel, only a fade. */
      faded: { opacity: 0, scale: 1, y: 0 },
    },
    /** A beat at the line's end (clock and buttons, a message): in from the right, out to the left. */
    beat: {
      shown: { opacity: 1, x: 0 },
      enterFrom: { opacity: 0, x: 6 },
      leaveTo: { opacity: 0, x: -4 },
      faded: { opacity: 0, x: 0 },
    },
    /** Chrome around the composer (the greeting, a recording's pill, the empty-chat note): it steps away from the composer. */
    chrome: {
      settled: { opacity: 1, y: 0 },
      above: { opacity: 0, y: -8 },
      below: { opacity: 0, y: 8 },
    },
  },
} as const;
