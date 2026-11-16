/** SDK fetch: Tauri's HTTP plugin (no CORS, no Origin header) in the app, native fetch in a browser; never overrides globalThis.fetch. */

import { isTauriEnvironment } from './tauri/environment.service';

let _fetch: typeof globalThis.fetch | null = null;
let _initialized = false;

/** Kasset is a native client, not a web page: an empty Origin makes the plugin send none, so servers never apply browser CORS rules. */
function withoutOrigin(tauriFetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Origin', '');
    return tauriFetch(input, { ...init, headers });
  };
}

/** Initialize the platform fetch. Must be called before any API requests. */
export async function initPlatformFetch(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  if (isTauriEnvironment()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    _fetch = withoutOrigin(tauriFetch);
  }
}

/** Get the platform-appropriate fetch function for SDK constructors. */
export function getPlatformFetch(): typeof globalThis.fetch {
  return _fetch ?? globalThis.fetch;
}
