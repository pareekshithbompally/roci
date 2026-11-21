/** The screens follow the store: every meeting write Rust commits is announced (`meeting://changed`), and the lists, the
 *  open meeting (both under the `meetings` key), that meeting's to-dos and the knowledge graph (a summary feeds it) are read
 *  again. The one way a meeting change reaches the UI. */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { RECORDING_EVENTS } from '@config/audio.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { useAppStore } from '@shared/stores/appStore';
import type { MeetingChanged } from '@shared/types/native';

const report = (error: unknown) => console.error('[meetingChanges] Refresh failed:', error);

/** A deleted meeting that is open (Keep, Delete All, a failed capture) is left, so the view never shows a meeting that is gone. */
function leaveIfOpen(id: string): void {
  const app = useAppStore.getState();
  if (app.selectedHistoryId !== id) return;
  app.setSelectedHistoryId(null);
  app.setCurrentView('home');
}

function follow({ id, deleted }: MeetingChanged): void {
  if (deleted) leaveIfOpen(id);
  queryClient.invalidateQueries({ queryKey: queryKeys.meetings() }).catch(report);
  queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(id) }).catch(report);
  queryClient.invalidateQueries({ queryKey: queryKeys.storeGlobalTodos() }).catch(report);
  queryClient.invalidateQueries({ queryKey: queryKeys.knowledge() }).catch(report);
}

export function followMeetingChanges(): Promise<UnlistenFn> {
  return listen<MeetingChanged>(RECORDING_EVENTS.meetingChanged, ({ payload }) => follow(payload));
}
