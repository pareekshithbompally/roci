/** Speech-to-text: audio → 16 kHz mono WAV parts, each run on its provider's speech endpoint or multimodal. */

import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import type { IntegrationId } from '@shared/utils/integrations';

export type TranscriptionAdapterId = 'openai-compatible' | 'deepgram' | 'elevenlabs' | 'multimodal' | 'hex' | 'apple-speech' | 'on-device';

/** Every part, chunk and stream is 16-bit PCM at this rate, mono. */
const SAMPLE_RATE = 16_000;

export const TRANSCRIPTION_CONFIG = {
  sampleRate: SAMPLE_RATE,
  /** Live dictation: the mic is sent to the engine in slices this long, ms. */
  liveChunkMs: 100,
  /** Real-time transcription copy for the General setting and the mark on speech models that support it. */
  liveCopy: {
    description: 'Words appear while you talk, in meetings and dictation.',
    /** What the chosen speech model does live: streams everywhere, streams dictation only, or chunks (near-live). */
    streams: 'Your speech model streams: words appear as you speak.',
    dictationOnly: 'Your speech model streams dictation; in meetings, words come about 8 seconds behind.',
    chunks: 'Your speech model works near-live: words come about 8 seconds behind.',
    mark: 'Real-time',
  },
  /** Spoken language sent to engines that take one; a language setting is out of scope. */
  language: 'en',
  /** Plain-text transcripts reflow into paragraphs of about this many characters (ends on a sentence). */
  paragraphChars: 480,

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

  /** Cloud speech models that stream (words as they are said), by adapter — the ones the AI SDK opens a stream for (OpenAI's
   *  gpt-4o transcribe models are upload-only there); any other model goes live in chunks. */
  streamingModels: {
    'openai-compatible': /^(gpt-transcribe|gpt-live-transcribe|gpt-realtime-whisper)/i,
    deepgram: /^(nova|flux)/i,
    elevenlabs: /realtime/i,
  } as Partial<Record<TranscriptionAdapterId, RegExp>>,
  /** Streaming audio: 16-bit little-endian PCM at the live sample rate. */
  streamingFormat: { type: 'audio/pcm', rate: SAMPLE_RATE },

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

  /** Silero VAD gate (only speech spans are transcribed), tuned for recall; spans are in recording-clock units. */
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

  /** Fitting a transcript into the Summary model's context window. */
  summaryBudget: {
    /** Characters per token for budgeting (conservative). */
    charsPerToken: 3,
    /** Tokens kept free for the model's answer. */
    outputTokens: 1_000,
    /** The opening's share of an excerpt; the rest is the end. */
    headShare: 0.6,
    /** A second try after "didn't fit" uses this share of the first budget. */
    retryShare: 0.6,
  },
} as const;
