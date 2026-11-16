/** `roci://` links parsed in Rust; `ask` and `meeting` arrive here, held until `ready()`. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

/** Rust `url_actions::ACTION_EVENT`. */
const ACTION_EVENT = 'url-action';

/** Rust `UrlAction` (the variants with a value). */
export type UrlAction = { kind: 'ask'; value: string } | { kind: 'meeting'; value: string };

export const urlActionsService = {
  onAction: (handler: (action: UrlAction) => void): Promise<UnlistenFn> =>
    listen<UrlAction>(ACTION_EVENT, (event) => handler(event.payload)),

  /** The webview can take actions now: Rust runs any that were waiting. */
  ready: (): Promise<void> => invoke('url_actions_ready'),
};
