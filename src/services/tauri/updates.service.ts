/** App updates are Rust's (src-tauri/src/updates.rs): it checks after launch and daily, and installs. The webview shows its state and asks. */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from './environment.service';

/** Rust → webview: the update state changed. */
const STATE_EVENT = 'updates://state';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; notes: string | null }
  | { status: 'downloading'; version: string; downloaded: number; total: number | null }
  | { status: 'installing'; version: string }
  | { status: 'failed'; version: string; error: string };

export const IDLE_UPDATE: UpdateState = { status: 'idle' };

export const updatesService = {
  /** Check now; resolves the state the check left (no notification). */
  check: () => invoke<UpdateState>('update_check'),
  /** The state as Rust holds it now. */
  current: () => invoke<UpdateState>('update_state'),
  /** Download, verify and install the waiting update; Roci relaunches when it's done. */
  install: () => invoke<void>('update_install'),

  /** Runs `handler` on every state change; returns the unsubscribe. */
  onState(handler: (state: UpdateState) => void): () => void {
    if (!isTauriEnvironment()) return () => undefined;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    listen<UpdateState>(STATE_EVENT, ({ payload }) => handler(payload))
      .then((fn) => (disposed ? fn() : (unlisten = fn)))
      .catch((error: unknown) => console.error('[UpdatesService] Listening for update state failed:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  },
};
