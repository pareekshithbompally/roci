/**
 * Platform-aware fetch
 *
 * In Tauri: routes through @tauri-apps/plugin-http (Rust reqwest, no CORS).
 * In browser: uses native fetch (for dev/preview without Tauri).
 *
 * Call initPlatformFetch() once at app startup, before any SDK clients are created.
 * Then use getPlatformFetch() in SDK constructors.
 *
 * IMPORTANT: We do NOT override globalThis.fetch — that breaks the WebView's
 * internal mechanisms (Vite HMR, module loading, etc.). Instead, SDK constructors
 * explicitly pass getPlatformFetch() via their `fetch:` parameter.
 */

import { isTauriEnvironment } from './tauri/environment.service';

let _fetch: typeof globalThis.fetch | null = null;
let _initialized = false;

/** Initialize the platform fetch. Must be called before any API requests. */
export async function initPlatformFetch(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  if (isTauriEnvironment()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    _fetch = tauriFetch;
  }
}

/** Get the platform-appropriate fetch function for SDK constructors. */
export function getPlatformFetch(): typeof globalThis.fetch {
  return _fetch ?? globalThis.fetch;
}
