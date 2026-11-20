/** Starts a recording with the source chosen in Settings › General › Capture (iPhone and iPad record the microphone). With
 *  Real-time transcription on it first tries real-time for each side, so the recorder knows to send frames or chunks. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { recording } from '@features/recording/stores/recordingStore';
import { liveTranscript } from '@features/recording/live';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { platform } from '@platform/index';

export function useStartRecording(): () => Promise<string> {
  const { settings, providers } = useSettings();
  const source = platform.canCaptureSystemAudio ? settings.defaultAudioSource ?? 'systemAndMicrophone' : 'microphone';
  const live = !!settings.liveTranscription;
  return useCallback(async () => {
    const streaming = live && (await liveTranscript.prepare(() => ({ settings, providers }), LIVE.sides[source]));
    return recording.start(source, streaming).catch((error: unknown) => {
      liveTranscript.release();
      throw error;
    });
  }, [live, settings, providers, source]);
}
