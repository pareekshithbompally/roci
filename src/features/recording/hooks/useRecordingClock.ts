/** The recording's one visible clock: its activity row's (written by the recording runtime, ticking only while recording and
 *  on screen), read by the record screen and the pill. */

import { useActivityStore } from '@shared/stores/activityStore';

/** The recording's activity row. */
export const RECORDING_ROW = 'recording';

export function useRecordingClock(): string | undefined {
  return useActivityStore((s) => s.items.find((item) => item.id === RECORDING_ROW)?.detail ?? undefined);
}
