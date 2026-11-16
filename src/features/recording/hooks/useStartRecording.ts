/** Starts a recording with the source chosen in Settings › General › Capture. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { recording } from '@features/recording/stores/recordingStore';

export function useStartRecording(): () => Promise<string> {
  const { settings } = useSettings();
  const source = settings.defaultAudioSource ?? 'systemAndMicrophone';
  return useCallback(() => recording.start(source), [source]);
}
