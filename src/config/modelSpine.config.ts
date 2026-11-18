/** Model spine: the jobs a model can do (as input→output modalities), and the name rules used when nothing else describes a model. */

/** What goes in or comes out of a model; `vector` is an embedding. */
export type Modality = 'text' | 'audio' | 'image' | 'video' | 'vector';

export type ModelJob = 'chat' | 'transcribe' | 'speak' | 'image' | 'embed';

/** A model fits a job when it takes the job's input and gives the job's output. */
export interface JobShape {
  input: Modality;
  output: Modality;
}

/** One name rule: a model id that matches takes these modalities. */
export interface NameRule {
  pattern: RegExp;
  input: readonly Modality[];
  output: readonly Modality[];
}

/** A model offered for a job before the user adds it (labelled as the provider names it). */
export interface SuggestedModel {
  id: string;
  label: string;
}

const AUDIO_TO_TEXT = { input: ['audio'], output: ['text'] } as const;

export const MODEL_SPINE_CONFIG = {
  jobs: {
    chat: { input: 'text', output: 'text' },
    transcribe: { input: 'audio', output: 'text' },
    speak: { input: 'text', output: 'audio' },
    image: { input: 'text', output: 'image' },
    embed: { input: 'text', output: 'vector' },
  } satisfies Record<ModelJob, JobShape>,

  /** Modalities Roci reads from any fact source; others (pdf, file) are dropped. */
  modalities: ['text', 'audio', 'image', 'video', 'vector'] as readonly Modality[],

  /** Last-resort description by model id, first match wins; a model matching none is unknown. */
  nameRules: [
    { pattern: /tts|text-to-speech/i, input: ['text'], output: ['audio'] },
    { pattern: /transcribe|whisper|parakeet|canary|moonshine|scribe|^nova-\d/i, input: ['audio'], output: ['text'] },
    { pattern: /voxtral/i, input: ['text', 'audio'], output: ['text'] },
    { pattern: /embed/i, input: ['text'], output: ['vector'] },
    { pattern: /image|imagen|dall-e/i, input: ['text', 'image'], output: ['image'] },
  ] satisfies NameRule[],

  /** What a provider's unknown models are: speech providers serve speech; any other serves language models. */
  providerModalities: { deepgram: AUDIO_TO_TEXT, elevenlabs: AUDIO_TO_TEXT } as Record<string, { input: readonly Modality[]; output: readonly Modality[] }>,
  assumedModalities: { input: ['text'], output: ['text'] } as { input: readonly Modality[]; output: readonly Modality[] },

  /** Offered for a job once the provider has a key, without being added; in picker order. Adding one is one entry. */
  suggested: {
    transcribe: {
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
    },
    speak: {
      openai: [{ id: 'gpt-4o-mini-tts', label: 'GPT-4o mini TTS' }],
      gemini: [{ id: 'gemini-3.8-flash-tts', label: 'Gemini 3.8 Flash TTS' }],
    },
    image: {
      openai: [
        { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
        { id: 'gpt-image-1-mini', label: 'GPT Image 1 mini' },
      ],
      gemini: [
        { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
        { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' },
      ],
    },
  } as Partial<Record<ModelJob, Record<string, readonly SuggestedModel[]>>>,
} as const;
