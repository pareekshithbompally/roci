/** Turns meetings in macOS Spotlight on or off; Rust keeps the index in step while on. */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';

export const spotlightService = {
  configure: async (enabled: boolean): Promise<void> => {
    if (!isTauriEnvironment()) return;
    await invoke('configure_meeting_spotlight', { enabled });
  },
};
