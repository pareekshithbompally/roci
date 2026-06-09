/**
 * Unified store client — the single TypeScript entry point for all DB operations.
 *
 * Every mutation goes through a Rust `tauri-plugin-store` command running inside a
 * SQLite transaction. Reads use TanStack Query hooks → this client → invoke().
 *
 * Phase 0 skeleton — only the health probe and meta commands are wired.
 * Domain commands land in Phases 1–5.
 */

import { invoke } from '@tauri-apps/api/core';
import { parseStoreError } from './errors';
import type { StoreMeta } from './types';

const PLUGIN = 'plugin:store|';

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(`${PLUGIN}${command}`, args);
  } catch (error: unknown) {
    throw parseStoreError(error);
  }
}

export const store = {
  /** Initialize the database — must be called once before any other operation. */
  async initialize(): Promise<void> {
    await call<void>('initialize');
  },

  /** Return index metadata (schema version, embedding model, dimensions). */
  async getMeta(): Promise<StoreMeta> {
    return call<StoreMeta>('get_meta');
  },

  /** Return database statistics. */
  async getStats(): Promise<unknown> {
    return call<unknown>('get_stats');
  },
};
