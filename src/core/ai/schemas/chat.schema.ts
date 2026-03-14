/**
 * Chat Response Schemas
 *
 * JSON Schema definitions for structured chat output.
 * The `response` field streams progressively; `suggestions` and `title`
 * are parsed only on completion.
 */

/**
 * Standard chat response schema — used for all exchanges after the first.
 * No `title` field so the model doesn't waste tokens generating one.
 */
export const CHAT_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    response: {
      type: 'string',
      description: 'The full assistant response in markdown format.',
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exactly 3 follow-up suggestions written as the user would type them.',
    },
  },
  required: ['response', 'suggestions'],
  additionalProperties: false,
} as const;

/**
 * Extended schema for the first message of a new session.
 * Includes a `title` field so we don't need a separate LLM call.
 */
export const CHAT_RESPONSE_WITH_TITLE_SCHEMA = {
  type: 'object' as const,
  properties: {
    response: {
      type: 'string',
      description: 'The full assistant response in markdown format.',
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exactly 3 follow-up suggestions written as the user would type them.',
    },
    title: {
      type: 'string',
      description: 'A concise 3-6 word title summarizing the conversation topic.',
    },
  },
  required: ['response', 'suggestions', 'title'],
  additionalProperties: false,
} as const;

/** TypeScript types matching the schemas */
export interface ChatResponse {
  response: string;
  suggestions: string[];
}

export interface ChatResponseWithTitle extends ChatResponse {
  title: string;
}
