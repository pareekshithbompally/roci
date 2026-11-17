/** Starts a recording with the source chosen in Settings › General › Capture; iPhone and iPad record the microphone. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { recording } from '@features/recording/stores/recordingStore';
import { platform } from '@platform/index';

export function useStartRecording(): () => Promise<string> {
  const { settings } = useSettings();
  const source = platform.canCaptureSystemAudio ? settings.defaultAudioSource ?? 'systemAndMicrophone' : 'microphone';
  return useCallback(() => recording.start(source), [source]);
}
