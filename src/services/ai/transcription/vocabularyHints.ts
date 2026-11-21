/** The custom vocabulary as each AI SDK speech family takes it, within that API's limits; a family whose SDK options have no
 *  term list (Deepgram's `keyterm` is one term; ElevenLabs files and OpenAI streams take none) gets nothing. */

import { TRANSCRIPTION_CONFIG, type SdkSpeechFamily } from '@config/transcription.config';
import type { experimental_streamTranscribe, experimental_transcribe } from 'ai';
import { termsWithin } from '@core/ai/prompts/personalization.prompt';

type FileOptions = Parameters<typeof experimental_transcribe>[0]['providerOptions'];
type LiveOptions = Parameters<typeof experimental_streamTranscribe>[0]['providerOptions'];

const { promptChars, keyterms } = TRANSCRIPTION_CONFIG.vocabularyHints;

/** The terms as a context prompt, or none while the list is empty. */
function termPrompt(terms: readonly string[]): string | undefined {
  return termsWithin(terms, promptChars).join(', ') || undefined;
}

/** What a file transcription sends: its provider options, and the context prompt among them (its echo is dropped). */
export interface FileHints {
  providerOptions: FileOptions;
  prompt?: string;
}

const FILE_HINTS: Partial<Record<SdkSpeechFamily, (terms: readonly string[]) => FileHints>> = {
  'openai-compatible': (terms) => {
    const prompt = termPrompt(terms);
    return { providerOptions: { openai: { prompt } }, prompt };
  },
};

const LIVE_HINTS: Partial<Record<SdkSpeechFamily, (terms: readonly string[]) => LiveOptions>> = {
  elevenlabs: (terms) => ({
    elevenlabs: { streaming: { keyterms: terms.filter((term) => term.length <= keyterms.maxChars).slice(0, keyterms.max) } },
  }),
};

/** What transcribing a file with these terms sends; nothing when the family takes no terms or there are none. */
export function fileHints(family: SdkSpeechFamily, terms: readonly string[]): FileHints {
  return (terms.length > 0 && FILE_HINTS[family]?.(terms)) || { providerOptions: undefined };
}

/** Provider options for a live stream with these terms; none when the family takes no terms or there are none. */
export function liveHints(family: SdkSpeechFamily, terms: readonly string[]): LiveOptions {
  return terms.length > 0 ? LIVE_HINTS[family]?.(terms) : undefined;
}
