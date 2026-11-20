/** Output of the titles & follow-ups call, defined once: only the fields a call asks for (the model's JSON schema and the
 *  reply's reader both come from it). */

import { z } from 'zod';
import { SUGGESTION_COUNT } from '@config/chat.config';
import type { ChatExtrasWant } from '@core/ai/prompts/chatExtras.prompt';

const title = z.string().trim()
  .describe('2 to 6 words naming the conversation\'s specific subject, not the kind of request; sentence case, in the user\'s language; no quotes, no emoji, no ending punctuation.');

const suggestions = z.array(z.string().trim().min(1).describe('One follow-up, written as the user would type it.'))
  .describe(`Exactly ${SUGGESTION_COUNT} follow-ups.`);

/** The schema for what `want` asks: a title, follow-ups, or both. */
export function chatExtrasSchema(want: ChatExtrasWant) {
  if (want.title && want.suggestions) return z.strictObject({ title, suggestions });
  return want.title ? z.strictObject({ title }) : z.strictObject({ suggestions });
}
