/** Starts a recording with the source chosen in Settings › General › Capture (iPhone and iPad record the microphone), telling
 *  the recorder whether the chosen speech model streams both sides of the meeting live. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useSelectedSpeechOption } from '@features/settings';
import { liveModeOf } from '@services/ai/transcription';
import { recording } from '@features/recording/stores/recordingStore';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { platform } from '@platform/index';

export function useStartRecording(): () => Promise<string> {
  const { settings, providers } = useSettings();
  const option = useSelectedSpeechOption();
  const source = platform.canCaptureSystemAudio ? settings.defaultAudioSource ?? 'systemAndMicrophone' : 'microphone';
  const streaming = !!settings.liveTranscription && liveModeOf(option, providers, LIVE.sources) === 'streams';
  return useCallback(() => recording.start(source, streaming), [source, streaming]);
}
