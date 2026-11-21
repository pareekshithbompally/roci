/** UI dimensions, spacing and layout constants. */

export const UI_CONFIG = {
  // Layout dimensions
  layout: {
    sidebarWidth: {
      default: 240,
      min: 200,
      max: 400,
    },
    /** Titlebar safe area; dragOffset + dragHeight === safeArea, leaving 4px for the native resize edge. */
    titlebar: {
      safeArea: 40,
      dragOffset: 4,
      dragHeight: 36,
    },
    /** Onboarding panel's top edge: pinned, so a taller or shorter next step grows downward instead of re-centring. */
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

  /** A glyph on an app-icon-sized tile, so a bare glyph weighs the same as the app icons beside it. */
  glyphTile: { tile: 34, glyph: 24 },
  /** Bar chart (usage trends): plot height (taller on touch), bar cap and gap, data-end radius, axis gutters, label density, dimmed bars. */
  /** Data tables: rows shown before the table scrolls inside its card (its header stays). */
  table: { visibleRows: 10 },
  chart: {
    /** The trend's plot, dates included (px). */
    trendHeight: 200,
    /** A donut's ring (px). */
    donutHeight: 180,
    /** Series colours in `tokens.css` (`--viz-1` …); never cycled — past them, a mark is neutral. */
    seriesSlots: 8,
    /** Legend rows a donut shows: the largest by name, then one "+N more" for the rest. */
    maxSlices: 6,
    /** A legend or table row’s model, provider or use-case icon (px). */
    rowIcon: 16,
    /** Marks: widest bar, its rounded top, the gap between slices (px). */
    barMaxWidth: 24,
    barRadius: 4,
    sliceGap: 2,
    /** Plot inset inside its card (px). */
    inset: 8,
    /** Opacity of the other marks while one is highlighted. */
    dimOpacity: 0.35,
  },
  /** A macOS app icon's visible body inside its canvas (824 of 1024): app icons scale up by its inverse to match a tile. */
  appIconBody: 824 / 1024,
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
    /** Touch screens: centred banners just under the status bar / Dynamic Island, inset from the screen edges. */
    touch: { belowSafeAreaPx: 8, sidePx: 12 },
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
  },






  // Activity tray
  activityTray: {
    width: 360,
    maxVisibleRows: 5,
    rowHeight: 44, // approximate px per row for max-height calc
    autoRemoveDelay: 3000, // ms before completed items auto-dismiss
    /** ms a finished batch (e.g. chat to-do proposals) stays visible before it clears. */
    settleDelay: 2000,
  },

  // Content constraints
  content: {
    snippetLength: 80,
  },




} as const;

/** Breakpoint values. */
/** Joins the facts in one line of meta, e.g. "214 tokens · 12.3s · 9.4 tok/s" or "56% · 3s left". */
export const META_SEPARATOR = ' · ';

/** An icon on a native menu row, in points. */
export const MENU_ICON_PT = 16;
/** Space between a button and the menu it opens below, in points. */
export const MENU_GAP_PT = 4;
/** SF Symbols for the actions menus share, drawn beside the label on a Mac. */
export const MENU_SYMBOLS = {
  rename: 'pencil',
  edit: 'pencil',
  delete: 'trash',
  retry: 'arrow.clockwise',
  cancel: 'xmark',
  transcribe: 'waveform',
  summarize: 'sparkles',
} as const;

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

