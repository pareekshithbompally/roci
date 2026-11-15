/**
 * Transcription Configuration
 *
 * One speech-to-text layer: the user picks a provider + model (like chat
 * models), the pipeline converts audio to 16 kHz mono WAV, splits it into
 * parts each adapter accepts, and runs the selection's adapter per part:
 * its provider's speech endpoint for speech models, otherwise the multimodal
 * adapter (a prompt with the audio) for any model that accepts audio input.
 */

import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import type { IntegrationId } from '@shared/utils/integrations';

export type TranscriptionAdapterId = 'openai-compatible' | 'deepgram' | 'elevenlabs' | 'multimodal' | 'hex' | 'apple-speech' | 'on-device';

export interface SpeechModel {
  id: string;
  label: string;
}

export const TRANSCRIPTION_CONFIG = {
  /** Every part is sent as 16-bit PCM WAV at this rate, mono. */
  sampleRate: 16_000,
  /** Live dictation: the mic is sent to the engine in slices this long, ms. */
  liveChunkMs: 100,
  /**
   * Real-time transcription copy: the General setting (what it does; why it
   * isn't showing yet, around the mark's icon) and the mark on speech models
   * that support it.
   */
  liveCopy: {
    description: 'Show words under the dictation pill as you speak. Works with select speech models.',
    unavailable: { before: "Your speech model doesn't support this. Pick one marked", after: 'in Settings › Capabilities.' },
    mark: 'Real-time transcription',
  },
  /** Spoken language sent to engines that take one; a language setting is out of scope. */
  language: 'en',
  /** Plain-text transcripts reflow into paragraphs of about this many characters (ends on a sentence). */
  paragraphChars: 480,

  /**
   * Longest part each adapter receives, in seconds (16 kHz × 2 B = 32 kB/s):
   * OpenAI-compatible uploads are capped at 25 MB (600 s = 19.2 MB);
   * Hex at 64 MiB and ~17.5 min of samples (900 s = 28.8 MB). On this Mac,
   * the engine splits further when a model has a per-run limit (Cohere).
   */
  partSeconds: {
    'openai-compatible': 600,
    deepgram: 900,
    elevenlabs: 900,
    multimodal: 600,
    hex: 900,
    'apple-speech': 900,
    'on-device': 900,
  } satisfies Record<TranscriptionAdapterId, number>,

  /**
   * Provider id → its speech endpoint adapter. Local servers (`local:*`) use the
   * OpenAI-compatible adapter. Providers without one (Gemini) transcribe via `multimodal`.
   */
  speechEndpointByProvider: {
    openai: 'openai-compatible',
    groq: 'openai-compatible',
    deepgram: 'deepgram',
    elevenlabs: 'elevenlabs',
    hex: 'hex',
    'apple-intelligence': 'apple-speech',
    'on-device': 'on-device',
  } as Record<string, TranscriptionAdapterId>,

  /**
   * Curated speech models per cloud provider, in picker order (their labels win).
   * Each runs on its provider's speech endpoint, or `multimodal` when the provider has none.
   */
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
    // Stable Flash-Lite: audio input at the text rate (ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
    gemini: [{ id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' }],
  } as Record<string, readonly SpeechModel[]>,

  /** Which models a local OpenAI-compatible server serves for speech-to-text, by id. */
  localSpeechModelPattern: /whisper|parakeet|canary|moonshine|voxtral|scribe/i,

  /** Auto-selected on first run: the first one whose provider has a key. */
  defaultOrder: [
    { provider: 'openai', model: 'gpt-4o-transcribe' },
    { provider: 'groq', model: 'whisper-large-v3-turbo' },
    { provider: 'deepgram', model: 'nova-3' },
    { provider: 'elevenlabs', model: 'scribe_v1' },
    { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
  ],

  /** Provider id of the running Hex app (no key; its models come from Hex). */
  hexProvider: 'hex',
  /** Apple speech (Integrations › Apple Intelligence): on this Mac, no key, one model. */
  appleSpeech: { provider: 'apple-intelligence', model: 'apple-speech', label: 'Apple Speech' },
  /** Kasset's own engine (transcribe.cpp, src-tauri/src/stt): no key, its speech models are local models. */
  onDevice: { provider: LOCAL_MODELS_CONFIG.provider.id },
  /** Speech providers that exist only while an integration is on (Settings › Integrations). */
  integrationByProvider: { hex: 'hex', 'apple-intelligence': 'appleIntelligence' } as Record<string, IntegrationId>,
  /** Speech providers that run without credentials. */
  keylessProviders: ['hex', 'apple-intelligence', 'on-device'] as readonly string[],
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

  /** Categories the Summary model files each meeting under. */
  categories: ['Work', 'Personal', 'Meeting', 'Idea'] as readonly string[],

  /** Fitting a transcript into the Summary model's context window (HEX `meeting/notes.rs`). */
  summaryBudget: {
    /** Characters per token for budgeting (HEX: 3 — conservative). */
    charsPerToken: 3,
    /** Tokens kept free for the model's answer. */
    outputTokens: 1_000,
    /** The opening's share of an excerpt; the rest is the end. */
    headShare: 0.6,
    /** A second try after "didn't fit" uses this share of the first budget. */
    retryShare: 0.6,
  },
} as const;
