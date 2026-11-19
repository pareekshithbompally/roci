/** The screens follow the store: every meeting write Rust commits is announced (`meeting://changed`), and the lists, that
 *  meeting's to-dos and the open meeting are read again. The one way a meeting change reaches the UI. */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { RECORDING_EVENTS } from '@config/audio.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { meetingPipeline } from './meetingPipeline';

interface MeetingChanged {
  id: string;
  deleted: boolean;
}

const report = (error: unknown) => console.error('[meetingChanges] Refresh failed:', error);

function follow({ id, deleted }: MeetingChanged): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.meetings() }).catch(report);
  queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(id) }).catch(report);
  queryClient.invalidateQueries({ queryKey: queryKeys.storeGlobalTodos() }).catch(report);
  if (!deleted) void meetingPipeline.showSaved(id);
}

export function followMeetingChanges(): Promise<UnlistenFn> {
  return listen<MeetingChanged>(RECORDING_EVENTS.meetingChanged, ({ payload }) => follow(payload));
}
