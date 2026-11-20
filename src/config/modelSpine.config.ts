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

  /** A model a server you run passes on to its maker's cloud (Ollama's `gemma4:31b-cloud`): paid, and listed in the
   *  catalog under its name without this ending. */
  cloudModelSuffix: /[-:]cloud$/,

} as const;
