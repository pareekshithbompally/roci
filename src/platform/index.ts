/** Platform: compile-time constant from Vite `define` (false in browser dev and tests). */

declare const __PLATFORM_MACOS__: boolean;

export const IS_MACOS = typeof __PLATFORM_MACOS__ !== 'undefined' && __PLATFORM_MACOS__;
