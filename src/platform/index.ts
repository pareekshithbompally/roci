/** Platform detection: Vite `define` compile-time constants, with a navigator fallback for browser dev. */

declare const __PLATFORM_MACOS__: boolean;
declare const __PLATFORM_WINDOWS__: boolean;
declare const __PLATFORM_LINUX__: boolean;

const detectPlatform = () => {
  // Vite compile-time constants are available in Tauri builds
  try {
    if (typeof __PLATFORM_MACOS__ !== 'undefined') return { macos: __PLATFORM_MACOS__, windows: __PLATFORM_WINDOWS__, linux: __PLATFORM_LINUX__ };
  } catch {
    // Not defined — fall through to runtime detection
  }

  // Runtime fallback for browser dev / non-Tauri
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    return {
      macos: /mac/i.test(ua),
      windows: /win/i.test(ua) && !/darwin/i.test(ua),
      linux: /linux/i.test(ua),
    };
  }

  return { macos: false, windows: false, linux: false };
};

const platform = detectPlatform();

export const IS_MACOS = platform.macos;
export const IS_WINDOWS = platform.windows;
export const IS_LINUX = platform.linux;
export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const SUPPORTS_VIBRANCY = IS_MACOS && IS_TAURI;
