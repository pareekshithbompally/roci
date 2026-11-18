/** Output of the follow-up suggestions call. */

import { SUGGESTION_COUNT } from '@config/chat.config';

export const SUGGESTIONS_SCHEMA = {
  type: 'object' as const,
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'string', description: 'One follow-up, written as the user would type it.' },
      description: `Exactly ${SUGGESTION_COUNT} follow-ups.`,
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
};
