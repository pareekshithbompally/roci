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
    /** Page scrollers (kit `PageScroll`): length of a faded bottom edge (matches the titlebar band). */
    pageScroll: {
      edgeFadePx: 40,
    },
  },

  /** macOS app icons shown on buttons that open them */
  appIcons: {
    finder: '/images/macos-finder-sm.png',
  },

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






  // Z-index scale
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    overlay: 1200,
    modal: 1300,
    popover: 1400,
    tooltip: 1500,
    notification: 1600,
    splash: 1700, // startup splash sits above everything until the app is ready (src/app/splash.ts)
  },

  // Activity tray
  activityTray: {
    width: 360,
    maxVisibleRows: 5,
    rowHeight: 44, // approximate px per row for max-height calc
    zIndex: 1200,
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
