/** Calendar plugin's Reminders commands; each reminder Roci writes is tagged with its to-do id. */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '@services/tauri/environment.service';
import type { CalendarAccessStatus } from '@services/calendar/types';

const PLUGIN = 'plugin:calendar|';
/** Mirrors `REMINDERS_CHANGED_EVENT` in the calendar plugin. */
const CHANGED_EVENT = 'reminders://changed';

export interface RemindersList {
  id: string;
  title: string;
}

/** One to-do as a reminder. `create`: make it when missing (new action items only). */
export interface ReminderInput {
  list_id: string;
  todo_id: string;
  title: string;
  notes: string | null;
  /** YYYY-MM-DD */
  due_date: string | null;
  completed: boolean;
  create: boolean;
}

export interface ReminderState {
  todo_id: string;
  completed: boolean;
}

export const remindersService = {
  async checkAccess(): Promise<CalendarAccessStatus> {
    if (!isTauriEnvironment()) return 'not_determined';
    return (await invoke<{ status: CalendarAccessStatus }>(`${PLUGIN}reminders_check_access`)).status;
  },

  /** Asks macOS (it prompts only while undecided); resolves whether access is granted. */
  async requestAccess(): Promise<boolean> {
    if (!isTauriEnvironment()) return false;
    return (await invoke<{ granted: boolean }>(`${PLUGIN}reminders_request_access`)).granted;
  },

  lists(): Promise<RemindersList[]> {
    return invoke<RemindersList[]>(`${PLUGIN}reminders_lists`);
  },

  /** The id of the list titled `title`, created when missing. */
  ensureList(title: string): Promise<string> {
    return invoke<string>(`${PLUGIN}reminders_ensure_list`, { title });
  },

  upsert(items: ReminderInput[]): Promise<void> {
    return invoke(`${PLUGIN}reminders_upsert`, { items });
  },

  /** Deletes the reminders of `todoIds` from the list; ones already gone are skipped. */
  remove(listId: string, todoIds: string[]): Promise<void> {
    return invoke(`${PLUGIN}reminders_remove`, { listId, todoIds });
  },

  states(listId: string): Promise<ReminderState[]> {
    return invoke<ReminderState[]>(`${PLUGIN}reminders_states`, { listId });
  },

  /** Fires when the reminders database changes in any app. */
  onChanged(listener: () => void): Promise<UnlistenFn> {
    return listen(CHANGED_EVENT, listener);
  },
};
