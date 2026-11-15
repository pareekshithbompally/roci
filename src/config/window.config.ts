/**
 * Window Management Configuration
 * 
 * Defines window behavior, dimensions, and state management settings.
 */

export interface WindowDimensions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface WindowPosition {
  x?: number;
  y?: number;
  center?: boolean;
}

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
}

export interface WindowConfig {
  dimensions: WindowDimensions;
  defaultPosition: WindowPosition;
  behavior: WindowBehavior;
  stateSave: StateSaveConfig;
}

export interface WindowBehavior {
  minimizeToTray: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
  alwaysOnTop: boolean;
  decorations: boolean;
  resizable: boolean;
  transparent: boolean;
}

export interface StateSaveConfig {
  enabled: boolean;
  debounceMs: number;
  savePosition: boolean;
  saveSize: boolean;
  saveMaximized: boolean;
  saveFullscreen: boolean;
}

/**
 * Default window configuration
 */
export const DEFAULT_WINDOW_CONFIG: WindowConfig = {
  dimensions: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    maxWidth: undefined,
    maxHeight: undefined
  },
  defaultPosition: {
    center: true
  },
  behavior: {
    minimizeToTray: true,
    closeToTray: true,
    startMinimized: false,
    alwaysOnTop: false,
    decorations: true,
    resizable: true,
    transparent: false
  },
  stateSave: {
    enabled: true,
    debounceMs: 500,
    savePosition: true,
    saveSize: true,
    saveMaximized: true,
    saveFullscreen: true
  }
};

/**
 * Window state storage key
 */
export const WINDOW_STATE_KEY = 'window-state';

/** Rust → webview (src-tauri/src/downloads.rs): a web download finished. */
export const DOWNLOAD_FINISHED_EVENT = 'downloads://finished';

/**
 * Default window state (used if no saved state exists)
 */
export const DEFAULT_WINDOW_STATE: Partial<WindowState> = {
  width: DEFAULT_WINDOW_CONFIG.dimensions.width,
  height: DEFAULT_WINDOW_CONFIG.dimensions.height,
  maximized: false,
  fullscreen: false
};

/**
 * Validate window dimensions
 */
export function validateDimensions(width: number, height: number, config: WindowConfig = DEFAULT_WINDOW_CONFIG): boolean {
  const { minWidth, minHeight, maxWidth, maxHeight } = config.dimensions;
  
  if (width < minWidth || height < minHeight) return false;
  if (maxWidth && width > maxWidth) return false;
  if (maxHeight && height > maxHeight) return false;
  
  return true;
}

/**
 * Constrain dimensions to valid range
 */
export function constrainDimensions(width: number, height: number, config: WindowConfig = DEFAULT_WINDOW_CONFIG): WindowDimensions {
  const { minWidth, minHeight, maxWidth, maxHeight } = config.dimensions;
  
  return {
    width: Math.max(minWidth, maxWidth ? Math.min(width, maxWidth) : width),
    height: Math.max(minHeight, maxHeight ? Math.min(height, maxHeight) : height),
    minWidth,
    minHeight,
    maxWidth,
    maxHeight
  };
}

/**
 * Validate window position (ensure it's visible on screen)
 */
export function validatePosition(x: number, y: number): boolean {
  // Basic check: position should be non-negative
  // More advanced check would involve screen bounds
  return x >= -100 && y >= -100; // Allow some off-screen for multi-monitor edge cases
}

/**
 * Get centered position for window
 */
export function getCenteredPosition(width: number, height: number): WindowPosition {
  if (typeof window === 'undefined') {
    return { center: true };
  }
  
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;
  
  return {
    x: Math.round((screenWidth - width) / 2),
    y: Math.round((screenHeight - height) / 2)
  };
}

/**
 * Merge window state with defaults
 */
export function mergeWindowState(savedState: Partial<WindowState>, defaults: Partial<WindowState> = DEFAULT_WINDOW_STATE): WindowState {
  return {
    x: savedState.x ?? defaults.x ?? 0,
    y: savedState.y ?? defaults.y ?? 0,
    width: savedState.width ?? defaults.width ?? DEFAULT_WINDOW_CONFIG.dimensions.width,
    height: savedState.height ?? defaults.height ?? DEFAULT_WINDOW_CONFIG.dimensions.height,
    maximized: savedState.maximized ?? defaults.maximized ?? false,
    fullscreen: savedState.fullscreen ?? defaults.fullscreen ?? false
  };
}
