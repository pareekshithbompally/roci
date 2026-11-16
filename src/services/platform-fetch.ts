/** SDK fetch: Tauri's HTTP plugin (Rust reqwest: no CORS, no Origin header); never overrides globalThis.fetch. */

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/** Kasset is a native client, not a web page: an empty Origin makes the plugin send none, so servers never apply browser CORS rules. */
const nativeFetch: typeof globalThis.fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Origin', '');
  return tauriFetch(input, { ...init, headers });
};

/** The fetch every HTTP call and SDK constructor uses. */
export function getPlatformFetch(): typeof globalThis.fetch {
  return nativeFetch;
}
