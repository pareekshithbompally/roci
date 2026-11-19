/** Start or stop recording — the one toggle behind ⌥⇧R and ⌘K: stops while recording, starts otherwise, waits out a start or
 *  stop in flight. Reads the live recorder state when called, so a long-lived handler never acts on a stale one. */

import { useCallback } from 'react';
import { recording, useRecordingStore } from '@features/recording/stores/recordingStore';
import { useStartRecording } from './useStartRecording';

export function useToggleRecording(): () => Promise<void> {
  const start = useStartRecording();
  return useCallback(async () => {
    const { meetingId, busy } = useRecordingStore.getState();
    if (busy) return;
    if (meetingId) await recording.stop();
    else await start();
  }, [start]);
}
