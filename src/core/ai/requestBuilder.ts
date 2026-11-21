/** Meeting analysis request: its prompt and schema, built as one pair. */

import { analysisSchema } from './schemas/transcription.schema';
import { jsonSchemaOf } from './schemas/reply';
import { buildTranscriptionPrompt } from './prompts/transcription.prompt';
import type { MeetingContext, UserNote } from './prompts/transcription.prompt';
import type { PromptPersonalization } from './prompts/personalization.prompt';

export interface TranscriptionRequestOptions {
  categories: string[];
  /** Calendar meeting context for action-item owners. */
  meetingContext?: MeetingContext;
  /** The user's notes from the meeting. */
  userNotes?: UserNote[];
  /** What the user set in Personalization. */
  personalization?: PromptPersonalization;
  /** From formatTemporalContext(). */
  temporalContext: string;
}

/** Analysis prompt and schema, built as one pair from the same categories and notes. */
export function buildTranscriptionRequest({ categories, meetingContext, userNotes, personalization, temporalContext }: TranscriptionRequestOptions) {
  const schema = analysisSchema(categories, (userNotes?.length ?? 0) > 0);
  const prompt = buildTranscriptionPrompt({ categories, meetingContext, userNotes, personalization, temporalContext, schema: jsonSchemaOf(schema) });
  return { prompt, schema };
}
