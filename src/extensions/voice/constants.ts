/**
 * Read-aloud voices — the single source of truth. macOS voices are built in
 * (WebKit's speechSynthesis, Apple's system voices); the others are
 * downloaded once from Hugging Face and run on this Mac in a worker.
 */

export type DownloadableVoiceId = 'kokoro' | 'supertonic';
export type VoiceId = 'macos' | DownloadableVoiceId;

export type VoiceEngine = 'kokoro' | 'supertonic';

export interface DownloadableVoice {
  label: string;
  /** Download size, as shown in the picker. */
  size: string;
  engine: VoiceEngine;
  model: string;
  dtype?: 'q8' | 'fp32' | 'fp16' | 'q4' | 'q4f16';
  /** The speaker: a Kokoro voice name, or a Supertonic voice file stem. */
  voice: string;
}

export const MACOS_VOICE = { label: 'macOS voices', size: 'Built in' } as const;

export const DOWNLOADABLE_VOICES: Record<DownloadableVoiceId, DownloadableVoice> = {
  kokoro: { label: 'Kokoro 82M', size: '92 MB', engine: 'kokoro', model: 'onnx-community/Kokoro-82M-v1.0-ONNX', dtype: 'q8', voice: 'af_heart' },
  supertonic: { label: 'Supertonic 2', size: '263 MB', engine: 'supertonic', model: 'onnx-community/Supertonic-TTS-2-ONNX', voice: 'F1' },
};

export const DOWNLOADABLE_VOICE_IDS = Object.keys(DOWNLOADABLE_VOICES) as DownloadableVoiceId[];

/** Ready to speak with no download. */
export const DEFAULT_VOICE: VoiceId = 'macos';

/** ActivityTray row for a voice download. */
export const voiceTrayId = (id: DownloadableVoiceId) => `voice-model:${id}`;
/** Persisted "downloaded and loaded once" flag. */
export const voiceReadyKey = (id: DownloadableVoiceId) => `voice_model_ready:${id}`;

/** Longest text synthesized in one pass; longer replies are split at sentences. */
export const MAX_CHUNK_CHARS = 240;
/** Supertonic quality/speed (its model card's defaults). */
export const SUPERTONIC_OPTIONS = { num_inference_steps: 5, speed: 1.05 } as const;
