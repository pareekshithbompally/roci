/** Names a new chat from its first exchange, through the one structured call with the chat's own model; a failure keeps the
 *  start of the question as the title. */

import { CHAT_TITLE_PROMPT, chatTitleSchema } from '@core/ai';
import { CHAT_TITLE_MAX_CHARS } from '@config/chat.config';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { generateStructured } from './structured';
import { exchangeText } from './promptText';

/** At most `CHAT_TITLE_MAX_CHARS`, cut at a word; trailing punctuation dropped. */
const tidy = (title: string): string =>
  (title.length > CHAT_TITLE_MAX_CHARS ? title.slice(0, CHAT_TITLE_MAX_CHARS).replace(/\s+\S*$/, '') : title).replace(/[.!?…]+$/, '').trim();

export async function generateChatTitle(options: { resolved: ResolvedModel; question: string; reply: string; sessionId: string }): Promise<string> {
  const fallback = tidy(options.question);
  const { title } = await generateStructured({
    job: 'chatTitle',
    model: options.resolved,
    instructions: CHAT_TITLE_PROMPT,
    prompt: exchangeText(options.question, options.reply),
    schema: chatTitleSchema,
    usage: { category: 'title-gen', sessionId: options.sessionId },
  }).catch((error: unknown) => {
    console.error('[chatTitle] Naming the chat failed:', error);
    return { title: '' };
  });
  return tidy(title) || fallback;
}
