/**
 * Transcription Response Schema
 *
 * JSON Schema for structured transcription/document processing output.
 * Used with non-streaming calls — the entire response is JSON.parse'd on completion.
 */

export const TRANSCRIPTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: {
      type: 'string',
      description: 'Concise descriptive title, max 6 words.',
    },
    summary: {
      type: 'string',
      description:
        'Structured markdown summary with headers: Meeting Overview, Key Discussion Points, Decisions Made, Action Items, Next Steps.',
    },
    categories: {
      type: 'array',
      items: { type: 'string' },
      description: 'One or more categories from the provided list.',
    },
    transcript: {
      type: 'string',
      description:
        'Complete verbatim transcription with timestamps in [MM:SS] Speaker: format.',
    },
  },
  required: ['title', 'summary', 'categories', 'transcript'],
  additionalProperties: false,
} as const;

export interface TranscriptionResponse {
  title: string;
  summary: string;
  categories: string[];
  transcript: string;
}
