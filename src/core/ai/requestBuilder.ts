/** Meeting analysis request: its prompt and schema, built as one pair. */

import { transcriptionSchema } from './schemas/transcription.schema';
import { buildTranscriptionPrompt } from './prompts/transcription.prompt';
import type { MeetingContext } from './prompts/transcription.prompt';
import type { TranscriptionRequestConfig } from './types';

export interface TranscriptionRequestOptions {
  categories: string[];
  /** Calendar meeting context for action-item owners. */
  meetingContext?: MeetingContext;
  /** From formatTemporalContext(). */
  temporalContext: string;
}

/** Analysis prompt and schema, built as one pair from the same categories. */
export function buildTranscriptionRequest({ categories, meetingContext, temporalContext }: TranscriptionRequestOptions): TranscriptionRequestConfig {
  const schema = transcriptionSchema(categories);
  const prompt = buildTranscriptionPrompt({ categories, meetingContext, temporalContext, schema });
  return { prompt, outputSchema: { name: 'transcription', schema } };
}
