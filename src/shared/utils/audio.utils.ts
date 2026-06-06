import { AUDIO_CONFIG } from '@config/audio.config';

export const audioContextOptions = { sampleRate: AUDIO_CONFIG.recording.defaultSampleRate };

// Re-export config constants under their original names for backward compatibility
export const MAX_AUDIO_SIZE_MB = AUDIO_CONFIG.recording.maxSizeMB;
export const MAX_AUDIO_SIZE_BYTES = AUDIO_CONFIG.recording.maxSizeBytes;
export const WAV_HEADER_SIZE_BYTES = AUDIO_CONFIG.recording.wavHeaderSizeBytes;
export const MIN_AUDIO_SIZE_BYTES = AUDIO_CONFIG.recording.minAudioSizeBytes;

/**
 * Detects the best supported audio MIME type for MediaRecorder in the current browser.
 */
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

/**
 * Converts a Blob to a Base64 string for API usage.
 */
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

/**
 * Formats seconds into MM:SS format.
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
