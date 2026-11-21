/** Starts the in-call transcript when a meeting starts recording with Live Transcript on, streamed or in chunks as the
 *  recorder was started; mounted once for the app. */

import { useEffect, useRef } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useRecordingMeetingId, useRecordingStore } from '@features/recording/stores/recordingStore';
import { liveTranscript } from './liveTranscript';

export function useMeetingLive(): void {
  const meetingId = useRecordingMeetingId();
  const { settings, providers } = useSettings();
  const context = useRef({ settings, providers });
  context.current = { settings, providers };

  const live = !!settings.liveTranscription;
  // the mode the recorder was started in (it reports it), so frames are never read as chunks
  const streaming = useRecordingStore((s) => s.liveStreaming);

  useEffect(() => {
    if (!meetingId || !live) return;
    liveTranscript.start(meetingId, () => context.current, streaming).catch((error: unknown) =>
      console.error('[useMeetingLive] could not start the in-call transcript:', error));
  }, [meetingId, live, streaming]);
}
