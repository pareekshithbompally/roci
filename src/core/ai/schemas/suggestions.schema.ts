/** Output of the follow-up suggestions call, defined once (the model's JSON schema and the reply's reader come from it). */

import { z } from 'zod';
import { SUGGESTION_COUNT } from '@config/chat.config';

export const suggestionsSchema = z.strictObject({
  suggestions: z.array(z.string().trim().min(1).describe('One follow-up, written as the user would type it.'))
    .describe(`Exactly ${SUGGESTION_COUNT} follow-ups.`),
});
