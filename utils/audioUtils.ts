export const audioContextOptions = { sampleRate: 16000 };

// Gemini File API supports up to 2GB. 
// We set a browser-safe limit of 500MB to avoid crashing the browser tab's memory.
export const MAX_AUDIO_SIZE_MB = 500;
export const MAX_AUDIO_SIZE_BYTES = MAX_AUDIO_SIZE_MB * 1024 * 1024;

// WAV header is exactly 44 bytes. Any file ≤ this size contains no audio data.
export const WAV_HEADER_SIZE_BYTES = 44;
// Minimum meaningful audio: header + at least 1 second of 16kHz 16-bit mono PCM = 32044 bytes
export const MIN_AUDIO_SIZE_BYTES = WAV_HEADER_SIZE_BYTES + (16000 * 2);

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