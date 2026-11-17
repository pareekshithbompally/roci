/** UI dimensions, spacing and layout constants. */

export const UI_CONFIG = {
  // Layout dimensions
  layout: {
    sidebarWidth: {
      default: 240,
      min: 200,
      max: 400,
    },
    sidebarBreakpoint: 1024, // lg breakpoint in pixels
    maxContentWidth: '95%', // Stretch close to edges but not sticking
    maxContentWidthPx: '1800px', // Maximum pixel width cap
    /** Titlebar safe area; dragOffset + dragHeight === safeArea, leaving 4px for the native resize edge. */
    titlebar: {
      safeArea: 40,
      dragOffset: 4,
      dragHeight: 36,
    },
    /** Onboarding panel's top edge: pinned, so a taller or shorter next step grows downward instead of re-centring. */
    onboardingPanelTop: '14vh',
    /** Meeting chat, anchored bottom-right `inset` from the window edges: its floating button, or its window (never taller than the space below the titlebar). */
    meetingChat: {
      inset: 16,
      popout: { width: 400, maxHeight: 600 },
    },
    /** Page scrollers (kit `PageScroll`): length of a faded bottom edge (matches the titlebar band). */
    pageScroll: {
      edgeFadePx: 40,
    },
  },

  /** macOS app icons shown on buttons that open them */
  appIcons: {
    finder: '/images/macos-finder-sm.png',
  },

  /** A choice card's icon slot: every icon centres in the same box, so titles line up whatever the icon's width. */
  choiceIconSlot: { width: 64, height: 44 },
  /** A glyph on an app-icon-sized tile, so a bare glyph weighs the same as the app icons beside it. */
  glyphTile: { tile: 34, glyph: 24 },
  /** A settings icon tile (System Settings / iOS Settings): edge and corner in px, larger on touch screens; white glyph stroke. */
  iconTile: { tile: 20, radius: 5, touch: { tile: 29, radius: 7 }, stroke: 2 },
  /** Provider logos fanned like cards: each tile slides out and tilts about its base, middle on top, every logo in view. */
  providerFan: { width: 64, height: 44, tile: 26, logo: 16, shiftPx: 19, spreadDeg: 14 },

  /** How long a copy button shows its "Copied" tick */
  copiedFeedbackMs: 2_000,

  // In-app toasts (Sonner, themed in @shared/ui/sonner)
  toast: {
    position: 'top-right',
    /** Below the titlebar safe area, clear of the window edge */
    offset: 48,
    /** A toast hugs its text, up to this width (then the text truncates). */
    maxWidthPx: 340,
    gap: 6,
    visible: 4,
    durationMs: 5_000,
    /** Toasts with a button stay longer so there's time to use it */
    actionDurationMs: 8_000,
  },

  // Command popovers (composer pickers) and their hover flyouts
  picker: {
    /** Gap between trigger and popover */
    sideOffset: 8,
    /** Gap between a hovered row and its flyout */
    flyoutOffset: 6,
    /** Popovers stay this far inside the window edges */
    collisionPadding: 12,
  },


  // Component sizing
  size: {
    button: {
      small: {
        width: '2rem', // 8 * 4px
        height: '2rem',
        iconSize: '1rem', // w-4 h-4
      },
      medium: {
        width: '2.5rem', // 10 * 4px
        height: '2.5rem',
        iconSize: '1.25rem', // w-5 h-5
      },
      large: {
        width: '4rem', // 16 * 4px
        height: '4rem',
        iconSize: '1.5rem', // w-6 h-6
      },
    },
    icon: {
      xsmall: 14,
      small: 16,
      medium: 20,
      large: 24,
      xlarge: 40,
      /** Touch screens (iOS text scale, 17 pt body): the same steps, larger. */
      touch: {
        xsmall: 17,
        small: 20,
        medium: 24,
        large: 28,
        xlarge: 48,
      },
    },
    avatar: {
      small: '2rem',
      medium: '2.5rem',
      large: '3rem',
    },
    visualizer: {
      containerHeight: '240px',
      minHeight: '180px',
    },
  },






  // Activity tray
  activityTray: {
    width: 360,
    maxVisibleRows: 5,
    rowHeight: 44, // approximate px per row for max-height calc
    autoRemoveDelay: 3000, // ms before completed items auto-dismiss
  },

  // Content constraints
  content: {
    maxLineLength: '80ch', // Optimal reading width
    snippetLength: 80,
    contextBefore: 20,
    contextAfter: 60,
  },




} as const;

/** Breakpoint values. */
/** Joins the facts in one line of meta, e.g. "214 tokens · 12.3s · 9.4 tok/s" or "56% · 3s left". */
export const META_SEPARATOR = ' · ';

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export function isAboveBreakpoint(width: number, breakpoint: keyof typeof BREAKPOINTS): boolean {
  return width >= BREAKPOINTS[breakpoint];
}

/** Apple system hues an icon tile can take (tokens `--bg-tile-*`). */
export type TileTint = 'grey' | 'blue' | 'indigo' | 'purple' | 'pink' | 'red' | 'orange' | 'green' | 'teal';

/** Settings icon colour by domain: the hue says what area a row belongs to, the glyph says what it does; one hue, one meaning. */
export const TILE_DOMAIN = {
  /** The app itself: appearance, storage, updates. */
  system: 'grey',
  /** AI models and where they come from. */
  intelligence: 'purple',
  /** Outside services Roci connects to. */
  connections: 'blue',
  /** Alerts and reminders. */
  alerts: 'red',
  /** Spend and activity. */
  activity: 'green',
  /** Modalities, wherever they appear (jobs, on-device models). */
  text: 'indigo',
  speech: 'pink',
  images: 'teal',
  meetings: 'orange',
} as const satisfies Record<string, TileTint>;
