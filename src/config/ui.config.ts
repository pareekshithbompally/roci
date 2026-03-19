/**
 * UI Configuration
 * 
 * Centralized UI constants for consistent styling across the application.
 * All dimensions, colors, spacing, and layout values should be defined here.
 */

export const UI_CONFIG = {
  // Layout dimensions
  layout: {
    sidebarWidth: {
      default: 260,
      min: 200,
      max: 400,
    },
    sidebarBreakpoint: 1024, // lg breakpoint in pixels
    maxContentWidth: '95%', // Stretch close to edges but not sticking
    maxContentWidthPx: '1800px', // Maximum pixel width cap
  },

  // Canvas dimensions
  canvas: {
    audioVisualizer: {
      width: 600,
      height: 240,
    },
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
      recordButton: {
        width: '100px',
        height: '100px',
        iconSize: '2rem',
      },
    },
    icon: {
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

  // Spacing scale (maps to Tailwind spacing)
  spacing: {
    xs: '0.5rem',  // 2 * 4px
    sm: '0.75rem', // 3 * 4px
    md: '1rem',    // 4 * 4px
    lg: '1.5rem',  // 6 * 4px
    xl: '2rem',    // 8 * 4px
    '2xl': '3rem', // 12 * 4px
    '3xl': '4rem', // 16 * 4px
  },

  // Border radius scale
  radius: {
    none: '0',
    sm: '0.25rem',   // rounded-sm
    DEFAULT: '0.375rem', // rounded
    md: '0.5rem',    // rounded-md
    lg: '0.75rem',   // rounded-lg
    xl: '1rem',      // rounded-xl
    '2xl': '1.5rem', // rounded-2xl
    '3xl': '1.75rem', // rounded-3xl
    full: '9999px',  // rounded-full
  },

  // Typography
  typography: {
    fontSize: {
      xs: '0.625rem',   // 10px
      sm: '0.75rem',    // 12px
      base: '0.9375rem', // 15px - custom for better readability
      md: '0.9375rem',  // 15px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.625',
      loose: '2',
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      black: '900',
    },
  },

  // Colors (semantic tokens)
  colors: {
    primary: {
      light: '#1e1c18', // parchment-900
      dark: '#e6e9f4',  // night-100
    },
    record: {
      light: '#ef4444', // red-500
      dark: '#ef4444',  // red-500 (same for both themes)
    },
    success: {
      light: '#16a34a', // green-600
      dark: '#22c55e',  // green-500
    },
    error: {
      light: '#dc2626', // red-600
      dark: '#ef4444',  // red-500
    },
    warning: {
      light: '#ea580c', // orange-600
      dark: '#f97316',  // orange-500
    },
    info: {
      light: '#2563eb', // blue-600
      dark: '#3b82f6',  // blue-500
    },
    
    // Audio visualizer colors
    visualizer: {
      idle: {
        light: '#e4e0d6', // parchment-300
        dark: '#525250',  // night-650
      },
      active: {
        light: '#ef4444',  // red-500
        dark: '#4ade80',   // green-400
      },
    },

    // Background colors
    background: {
      primary: {
        light: '#fbfaf7', // parchment-100
        dark: '#262624',  // night-900
      },
      secondary: {
        light: '#ffffff', // parchment-50
        dark: '#2c2c2a',  // night-850
      },
      tertiary: {
        light: '#f0ede5', // parchment-200
        dark: '#343432',  // night-800
      },
    },

    // Border colors
    border: {
      light: '#e4e0d6', // parchment-300
      dark: '#454543',  // night-700
    },

    // Text colors
    text: {
      primary: {
        light: '#1e1c18', // parchment-900
        dark: '#f2f4fc',  // night-50
      },
      secondary: {
        light: '#6b655c', // parchment-700
        dark: '#8b92a8',  // night-400
      },
      tertiary: {
        light: '#8a847a', // parchment-600
        dark: '#5c6278',  // night-500
      },
    },
  },

  // Shadow scale
  shadow: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    glow: '0 0 40px rgba(14, 13, 11, 0.12)', // parchment-950 tint
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

  // Audio player
  audioPlayer: {
    height: '3rem', // 48px
    timeWidth: '3rem', // 48px
    buttonSize: '2.5rem', // 40px
    sliderHeight: '1.5rem', // 24px
    trackHeight: '0.375rem', // 6px
  },

  // Search and filters
  search: {
    inputHeight: '2.5rem', // 40px
    debounceDelay: 300, // ms
  },

  // Empty states
  empty: {
    iconSize: '3rem', // 48px
    maxWidth: '28rem', // 448px
  },

  // Loading states
  loading: {
    spinnerSize: {
      small: '1rem',
      medium: '1.5rem',
      large: '2.5rem',
    },
    glowSize: '6rem', // 96px for loading view
  },
} as const;

/**
 * Helper function to get color based on theme
 */
export function getThemedColor(
  colorPath: string,
  isDark: boolean
): string {
  const parts = colorPath.split('.');
  let value: any = UI_CONFIG.colors;
  
  for (const part of parts) {
    value = value[part];
  }
  
  if (typeof value === 'object' && 'light' in value && 'dark' in value) {
    return isDark ? value.dark : value.light;
  }
  
  return value;
}

/**
 * Breakpoint utilities
 */
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
