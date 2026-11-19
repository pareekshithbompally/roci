/** Output of naming a new chat, defined once. */

import { z } from 'zod';

export const chatTitleSchema = z.strictObject({
  title: z.string().trim().describe('2 to 6 words naming the conversation\'s specific subject, not the kind of request; sentence case, in the user\'s language; no quotes, no emoji, no ending punctuation.'),
});
