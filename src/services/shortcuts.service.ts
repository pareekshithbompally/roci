/**
 * Global Shortcuts Service — registers `GLOBAL_SHORTCUTS` with the OS (Tauri
 * global-shortcut, src-tauri/src/shortcuts.rs) and dispatches each trigger to
 * its handlers. In-window shortcuts are `@features/shortcuts`.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { GLOBAL_SHORTCUTS, GLOBAL_SHORTCUT_EVENT } from '@config/shortcuts.config';
import type { GlobalShortcutId } from '@config/shortcuts.config';

export type ShortcutHandler = () => void | Promise<void>;

const isGlobalShortcutId = (value: string): value is GlobalShortcutId => value in GLOBAL_SHORTCUTS;

class ShortcutsService {
  private handlers = new Map<GlobalShortcutId, ShortcutHandler[]>();
  private initialized = false;

  /** Listen for triggers, then register every global shortcut. A shortcut the
   *  OS refuses (taken by another app) is logged and skipped. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await listen<string>(GLOBAL_SHORTCUT_EVENT, (event) => {
      if (isGlobalShortcutId(event.payload)) void this.trigger(event.payload);
    });
    for (const id of Object.keys(GLOBAL_SHORTCUTS) as GlobalShortcutId[]) {
      const { accelerator } = GLOBAL_SHORTCUTS[id];
      try {
        await invoke('register_shortcut', { shortcut: accelerator, action: id });
      } catch (error: unknown) {
        console.warn(`[ShortcutsService] Could not register ${accelerator}:`, error);
      }
    }
    this.initialized = true;
  }

  /** Add a handler for one global shortcut; returns its unsubscribe. */
  on(id: GlobalShortcutId, handler: ShortcutHandler): () => void {
    this.handlers.set(id, [...(this.handlers.get(id) ?? []), handler]);
    return () => this.handlers.set(id, (this.handlers.get(id) ?? []).filter((h) => h !== handler));
  }

  private async trigger(id: GlobalShortcutId): Promise<void> {
    for (const handler of this.handlers.get(id) ?? []) {
      try {
        await handler();
      } catch (error: unknown) {
        console.error(`[ShortcutsService] Handler for ${id} failed:`, error);
      }
    }
  }
}

export const shortcutsService = new ShortcutsService();
