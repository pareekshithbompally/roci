import type { AudioCaptureSource } from '@config/audio.config';
import { platform } from '@platform/index';
import type { AppSettings } from '@shared/types';

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}


/** What a recording captures: the source chosen in Settings › General › Capture on Mac; the microphone on iPhone and iPad. */
export const captureSourceOf = (settings: Pick<AppSettings, 'defaultAudioSource'>): AudioCaptureSource =>
  platform.canCaptureSystemAudio ? settings.defaultAudioSource ?? 'systemAndMicrophone' : 'microphone';
