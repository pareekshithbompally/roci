/**
 * Transcription Configuration
 *
 * One speech-to-text layer: the user picks a provider + model (like chat
 * models), the pipeline converts audio to 16 kHz mono WAV, splits it into
 * parts each adapter accepts, and runs that provider's adapter per part.
 */

import type { IntegrationId } from '@shared/utils/integrations';

export type TranscriptionAdapterId = 'openai-compatible' | 'deepgram' | 'elevenlabs' | 'gemini' | 'hex' | 'apple-speech';

export interface SpeechModel {
  id: string;
  label: string;
}

export const TRANSCRIPTION_CONFIG = {
  /** Every part is sent as 16-bit PCM WAV at this rate, mono. */
  sampleRate: 16_000,
  /** Spoken language sent to engines that take one; a language setting is out of scope. */
  language: 'en',
  /** Plain-text transcripts reflow into paragraphs of about this many characters (ends on a sentence). */
  paragraphChars: 480,

  /**
   * Longest part each adapter receives, in seconds (16 kHz × 2 B = 32 kB/s):
   * OpenAI-compatible uploads are capped at 25 MB (600 s = 19.2 MB);
   * Hex at 64 MiB and ~17.5 min of samples (900 s = 28.8 MB).
   */
  partSeconds: {
    'openai-compatible': 600,
    deepgram: 900,
    elevenlabs: 900,
    gemini: 600,
    hex: 900,
    'apple-speech': 900,
  } satisfies Record<TranscriptionAdapterId, number>,

  /** Provider id → adapter. Local servers (`local:*`) use the OpenAI-compatible adapter. */
  adapterByProvider: {
    openai: 'openai-compatible',
    groq: 'openai-compatible',
    deepgram: 'deepgram',
    elevenlabs: 'elevenlabs',
    gemini: 'gemini',
    hex: 'hex',
    'apple-intelligence': 'apple-speech',
  } as Record<string, TranscriptionAdapterId>,

  /** Speech models each cloud provider offers, in the order they're listed. */
  providerModels: {
    openai: [
      { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe' },
      { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o mini Transcribe' },
      { id: 'gpt-4o-transcribe-diarize', label: 'GPT-4o Transcribe (diarized)' },
      { id: 'whisper-1', label: 'Whisper' },
    ],
    groq: [
      { id: 'whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo' },
      { id: 'whisper-large-v3', label: 'Whisper Large v3' },
    ],
    deepgram: [{ id: 'nova-3', label: 'Nova-3 (diarized)' }],
    elevenlabs: [{ id: 'scribe_v1', label: 'Scribe v1' }],
    gemini: [{ id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (multimodal)' }],
  } as Record<string, readonly SpeechModel[]>,

  /** Which models a local OpenAI-compatible server serves for speech-to-text, by id. */
  localSpeechModelPattern: /whisper|parakeet|canary|moonshine|voxtral|scribe/i,

  /** Auto-selected on first run: the first one whose provider has a key. */
  defaultOrder: [
    { provider: 'openai', model: 'gpt-4o-transcribe' },
    { provider: 'groq', model: 'whisper-large-v3-turbo' },
    { provider: 'deepgram', model: 'nova-3' },
    { provider: 'elevenlabs', model: 'scribe_v1' },
    { provider: 'gemini', model: 'gemini-2.0-flash' },
  ],

  /** Provider id of the running Hex app (no key; its models come from Hex). */
  hexProvider: 'hex',
  /** Apple speech (Integrations › Apple Intelligence): on this Mac, no key, one model. */
  appleSpeech: { provider: 'apple-intelligence', model: 'apple-speech', label: 'Apple Speech' },
  /** Speech providers that exist only while an integration is on (Settings › Integrations). */
  integrationByProvider: { hex: 'hex', 'apple-intelligence': 'appleIntelligence' } as Record<string, IntegrationId>,
  /** Speech providers that run without credentials. */
  keylessProviders: ['hex', 'apple-intelligence'] as readonly string[],
  /** Hex models Kasset doesn't offer: Apple speech is Kasset-native (Apple Intelligence), never via Hex. */
  hiddenHexModels: ['apple_speech'] as readonly string[],

  /**
   * Silero VAD gate: speech spans are the only audio sent to transcription.
   * Tuned for recall — a missed word is lost content, a false alarm is just
   * one more adapter call (today's behavior). Thresholds mirror vad-web's
   * NonRealTimeVAD defaults; merging/padding is in recording-clock units.
   */
  vad: {
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    /** Pauses shorter than this stay inside one segment. */
    redemptionMs: 800,
    /** Audio kept before a detected onset so word starts aren't clipped. */
    preSpeechPadMs: 120,
    /** Segments shorter than this are blips (clicks), not speech. */
    minSpeechMs: 200,
    /** Segments separated by less than this are transcribed as one range. */
    mergeGapMs: 2000,
    /** Ranges shorter than this are symmetrically extended with real audio. */
    minRangeMs: 1500,
    /** Upper bound for VAD on one recording (2 h audio ≈ 1–2 min single-thread). */
    timeoutMs: 300_000,
  },
} as const;
