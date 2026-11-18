/** Follow-up suggestions shown under a chat reply; the output shape is SUGGESTIONS_SCHEMA. */

import { SUGGESTION_COUNT } from '@config/chat.config';

export const SUGGESTIONS_PROMPT = `Suggest ${SUGGESTION_COUNT} short follow-ups the user might send next, based on their message and the assistant's reply.

- Write each one as the user would type it: "Show me the action items", not "Would you like to see the action items?"
- Keep each under 12 words, in the language the user writes in.
- Make them different from each other and useful next steps, not rewordings of the question.`;
