/** Starts the in-call transcript when a meeting starts recording; mounted once for the app, so it runs whatever screen is open. */

import { useEffect, useRef } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useRecordingMeetingId } from '@features/recording/stores/recordingStore';
import { liveTranscript } from './liveTranscript';

export function useMeetingLive(): void {
  const meetingId = useRecordingMeetingId();
  const { settings, providers } = useSettings();
  const context = useRef({ settings, providers });
  context.current = { settings, providers };

  useEffect(() => {
    if (!meetingId) return;
    liveTranscript.start(meetingId, () => context.current).catch((error: unknown) =>
      console.error('[useMeetingLive] could not start the in-call transcript:', error));
  }, [meetingId]);
}
