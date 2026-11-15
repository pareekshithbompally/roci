/**
 * Spotlight service — invoke wrappers for meetings in macOS Spotlight:
 * the Core Spotlight plugin reports support, Rust indexes meetings while on.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';

export interface SpotlightStatus {
  /** Core Spotlight works only in the installed app bundle. */
  supported: boolean;
}

export const spotlightService = {
  status: async (): Promise<SpotlightStatus> =>
    isTauriEnvironment() ? invoke<SpotlightStatus>('plugin:core-spotlight|status') : { supported: false },

  configure: async (enabled: boolean): Promise<void> => {
    if (!isTauriEnvironment()) return;
    await invoke('configure_meeting_spotlight', { enabled });
  },
};
