/** Each provider's low-cost model per job, offered together once it connects (onboarding's Go with Defaults). A job left out
 *  has no model of the provider's: Apple Speech, the system voices and no images stand in. Model facts stay in models.dev. */

import { APPLE_INTELLIGENCE } from '@config/providers.config';

export interface ProviderDefaultModels {
  chat: string;
  transcription?: string;
  readAloud?: string;
  images?: string;
}

export const PROVIDER_DEFAULTS: Readonly<Record<string, ProviderDefaultModels>> = {
  openai: { chat: 'gpt-6-luna', transcription: 'gpt-4o-mini-transcribe', readAloud: 'gpt-4o-mini-tts' },
  anthropic: { chat: 'claude-haiku-5-5' },
  gemini: {
    chat: 'gemini-3.1-flash-lite',
    transcription: 'gemini-3.1-flash-lite',
    readAloud: 'gemini-2.5-flash-preview-tts',
    images: 'gemini-3.1-flash-lite-image',
  },
  openrouter: { chat: 'openai/gpt-6-luna' },
  mistral: { chat: 'mistral-small-latest' },
  groq: { chat: 'openai/gpt-oss-20b', transcription: 'whisper-large-v3-turbo' },
  [APPLE_INTELLIGENCE.provider]: { chat: APPLE_INTELLIGENCE.model },
  'on-device': { chat: 'minicpm5-2b', transcription: 'whisper-small' },
};
