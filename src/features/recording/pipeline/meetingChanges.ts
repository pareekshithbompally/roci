/** The screens follow the store: every meeting write Rust commits is announced (`meeting://changed`), and the lists, the
 *  open meeting (both under the `meetings` key) and that meeting's to-dos are read again. The one way a meeting change
 *  reaches the UI. */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { RECORDING_EVENTS } from '@config/audio.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import type { MeetingChanged } from '@shared/types/native';

const report = (error: unknown) => console.error('[meetingChanges] Refresh failed:', error);

function follow({ id }: MeetingChanged): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.meetings() }).catch(report);
  queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(id) }).catch(report);
  queryClient.invalidateQueries({ queryKey: queryKeys.storeGlobalTodos() }).catch(report);
}

export function followMeetingChanges(): Promise<UnlistenFn> {
  return listen<MeetingChanged>(RECORDING_EVENTS.meetingChanged, ({ payload }) => follow(payload));
}
