import { AUDIO_CONFIG, type AudioCaptureSource } from '@config/audio.config';
import { platform } from '@platform/index';
import type { AppSettings } from '@shared/types';

export const audioContextOptions = { sampleRate: AUDIO_CONFIG.recording.defaultSampleRate };

// Re-export config constants under their original names for backward compatibility
export const MAX_AUDIO_SIZE_MB = AUDIO_CONFIG.recording.maxSizeMB;
export const MAX_AUDIO_SIZE_BYTES = AUDIO_CONFIG.recording.maxSizeBytes;
export const WAV_HEADER_SIZE_BYTES = AUDIO_CONFIG.recording.wavHeaderSizeBytes;
export const MIN_AUDIO_SIZE_BYTES = AUDIO_CONFIG.recording.minAudioSizeBytes;

/** Best audio MIME type MediaRecorder supports in this webview. */
export function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;

  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/wav'
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return undefined;
}

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
