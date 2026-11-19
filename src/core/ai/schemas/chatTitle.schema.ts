/** Output of naming a new chat, defined once. */

import { z } from 'zod';

export const chatTitleSchema = z.strictObject({
  title: z.string().trim().describe('3 to 6 words naming the conversation\'s topic, in the user\'s language; no quotes, no ending punctuation.'),
});
