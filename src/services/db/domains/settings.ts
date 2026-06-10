/**
 * Settings domain — get all key-value settings, set a single key.
 */

import { call, type RustSettingsEntry } from '../internal';

export const settings = {
  /** Get all settings as key-value pairs. */
  async getAll(): Promise<Record<string, string>> {
    const entries = await call<RustSettingsEntry[]>('settings_get_all');
    const map: Record<string, string> = {};
    for (const e of entries) {
      map[e.key] = e.value;
    }
    return map;
  },

  /** Set a single setting key. */
  async set(key: string, value: string): Promise<void> {
    await call<void>('settings_set', { key, value });
  },
};
