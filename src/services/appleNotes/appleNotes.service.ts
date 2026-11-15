/** Apple Notes plugin wrappers (Apple Events): Automation consent and one note per meeting. */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import type { CalendarAccessStatus } from '@services/calendar/types';

const PLUGIN = 'plugin:apple-notes|';

export interface NoteInput {
  folder: string;
  /** A line in the note that identifies it on later saves. */
  tag: string;
  title: string;
  html: string;
}

export const appleNotesService = {
  /** Automation consent for Notes; `ask` raises the macOS prompt while undecided. */
  async access(ask: boolean): Promise<CalendarAccessStatus> {
    if (!isTauriEnvironment()) return 'not_determined';
    return invoke<CalendarAccessStatus>(`${PLUGIN}access`, { ask });
  },

  upsert: (note: NoteInput) => invoke<void>(`${PLUGIN}upsert`, { note }),
};
