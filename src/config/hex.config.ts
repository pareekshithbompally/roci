/**
 * Hex Transcription Configuration
 *
 * Kasset transcribes through the running Hex app's local API (see
 * src-tauri/src/hex_stt). Hex accepts complete PCM WAV up to 64 MiB and
 * 16,777,216 normalized 16 kHz samples (~17.5 min) per request, so long audio
 * is sent in parts.
 */

export const HEX_CONFIG = {
  /** Audio is converted to this rate, mono, before sending (Hex's native rate). */
  sampleRate: 16_000,
  /** Length of one part. 900 s × 16 kHz × 2 B = 28.8 MB, under both Hex limits. */
  chunkSeconds: 900,
  /** Hex's default; a language setting is out of scope. */
  language: 'en',
} as const;
