/** Speech-to-text: audio → 16 kHz mono WAV parts, each run on its provider's speech endpoint or multimodal. */

import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import type { IntegrationId } from '@shared/utils/integrations';

/** The speech-to-text API families the AI SDK builds a transcription model for (one package each, in services/ai/provider.ts). */
export const SDK_SPEECH_FAMILIES = ['openai-compatible', 'deepgram', 'elevenlabs'] as const;
export type SdkSpeechFamily = (typeof SDK_SPEECH_FAMILIES)[number];
/** How a speech model runs: an AI SDK family, a chat model hearing audio (multimodal), or an engine on this Mac. */
export type TranscriptionAdapterId = SdkSpeechFamily | 'multimodal' | 'hex' | 'apple-speech' | 'on-device';

/** Every part, chunk and stream is 16-bit PCM at this rate, mono. */
const SAMPLE_RATE = 16_000;

export const TRANSCRIPTION_CONFIG = {
  sampleRate: SAMPLE_RATE,
  /** Live dictation: the mic is sent to the engine in slices this long, ms. */
  liveChunkMs: 100,
  /** Live transcript copy: the General setting, and the mark on speech models known to stream. */
  liveCopy: {
    title: 'Live Transcript',
    description: 'Shows the transcript while you record and dictate.',
    /** When the chosen speech model's words appear: as you speak (it streams), every few seconds (chunks), or either. */
    streams: 'With your speech model, words appear as you speak.',
    dictationOnly: 'With your speech model, words appear as you speak in dictation, and every few seconds in meetings.',
    tried: 'With your speech model, words appear as you speak if it streams, otherwise every few seconds.',
    chunks: 'With your speech model, words appear every few seconds.',
    mark: 'Live',
  },
  /** A whole recording with no speech: nothing to summarize. */
  noSpeech: 'No speech detected in this recording — transcription skipped.',
  /** Plain-text transcripts reflow into paragraphs of about this many characters (ends on a sentence). */
  paragraphChars: 480,
  /** A transcript reads as speaker turns, each with the time it began: a speaker's lines this close (s) are one turn, and a
   *  silence this long (s) before a turn is marked. */
  turns: { joinGapSeconds: 3, markSilenceSeconds: 30, silence: 'pause' },

  /** The custom vocabulary as cloud speech APIs take it: a context prompt of the first terms within `promptChars` (Whisper's
   *  prompt holds 224 tokens), or a key-term list within the API's own limits (ElevenLabs streaming: 50 terms of ≤20 characters). */
  vocabularyHints: {
    promptChars: 500,
    keyterms: { max: 50, maxChars: 20 },
  },

  /** Longest part per adapter in seconds (32 kB/s): OpenAI-compatible caps uploads at 25 MB, Hex at 64 MiB. */
  partSeconds: {
    'openai-compatible': 600,
    deepgram: 900,
    elevenlabs: 900,
    multimodal: 600,
    hex: 900,
    'apple-speech': 900,
    'on-device': 900,
  } satisfies Record<TranscriptionAdapterId, number>,

  /** Provider id → speech endpoint adapter; `local:*` uses OpenAI-compatible, others fall back to `multimodal`. */
  speechEndpointByProvider: {
    openai: 'openai-compatible',
    groq: 'openai-compatible',
    deepgram: 'deepgram',
    elevenlabs: 'elevenlabs',
    hex: 'hex',
    'apple-intelligence': 'apple-speech',
    'on-device': 'on-device',
  } as Record<string, TranscriptionAdapterId>,

  /** Cloud streaming audio: 16-bit little-endian PCM at 24 kHz, the one rate every cloud stream takes (OpenAI only 24 kHz;
   *  ElevenLabs 8–48 kHz; Deepgram any). */
  streamingFormat: { type: 'audio/pcm', rate: 24_000 },

  /** Provider id of the running Hex app (no key; its models come from Hex). */
  hexProvider: 'hex',
  /** Apple speech (Integrations › Apple Intelligence): on this Mac, no key, one model. */
  appleSpeech: { provider: 'apple-intelligence', model: 'apple-speech', label: 'Apple Speech' },
  /** Roci's own engine (transcribe.cpp, src-tauri/src/stt): no key, its speech models are local models. */
  onDevice: { provider: LOCAL_MODELS_CONFIG.provider.id },
  /** Speech providers that exist only while an integration is on (Hex in Integrations, Apple Intelligence in Providers). */
  integrationByProvider: { hex: 'hex', 'apple-intelligence': 'appleIntelligence' } as Record<string, IntegrationId>,
  /** Speech providers that run without credentials. */
  keylessProviders: ['hex', 'apple-intelligence', 'on-device'] as readonly string[],
  /** Hex models Roci doesn't offer: Apple speech is Roci-native (Apple Intelligence), never via Hex. */
  hiddenHexModels: ['apple_speech'] as readonly string[],

  /** How the speech detector's spans become the ranges sent to transcription (its own tuning lives with it, in Rust). */
  vad: {
    /** Segments separated by less than this are transcribed as one range. */
    mergeGapMs: 2000,
    /** Ranges shorter than this are symmetrically extended with real audio. */
    minRangeMs: 1500,
  },

  /** Categories the Summary model files each meeting under. */
  categories: ['Work', 'Personal', 'Meeting', 'Idea'] as readonly string[],

  /** Fitting a transcript into the Summary model's context window. */
  summaryBudget: {
    /** Tokens kept free for the model's answer. */
    outputTokens: 1_000,
    /** The opening's share of an excerpt; the rest is the end. */
    headShare: 0.6,
    /** A second try after "didn't fit" uses this share of the first budget. */
    retryShare: 0.6,
  },
} as const;
