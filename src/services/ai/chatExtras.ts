/** After a reply, one structured call names a new chat and/or suggests follow-ups (Settings › Default Models › Titles &
 *  follow-ups); callers treat a failure as neither. */

import { chatExtrasPrompt, chatExtrasSchema, type ChatExtrasWant, type ChatToolset } from '@core/ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { CHAT_TITLE_MAX_CHARS, SUGGESTION_COUNT } from '@config/chat.config';
import { generateStructured } from './structured';
import { exchangeText } from './promptText';

export interface ChatExtras {
  /** Absent when not asked for or left empty. */
  title?: string;
  suggestions: string[];
}

/** At most `CHAT_TITLE_MAX_CHARS`, cut at a word; trailing punctuation dropped. */
const tidy = (title: string): string =>
  (title.length > CHAT_TITLE_MAX_CHARS ? title.slice(0, CHAT_TITLE_MAX_CHARS).replace(/\s+\S*$/, '') : title).replace(/[.!?…]+$/, '').trim();

export async function generateChatExtras(options: {
  resolved: ResolvedModel;
  want: ChatExtrasWant;
  question: string;
  reply: string;
  /** The tools the reply had: follow-ups ask only for what Roci can do here. */
  tools: ChatToolset;
  sessionId: string;
}): Promise<ChatExtras> {
  const { want, tools } = options;
  const reply: { title?: string; suggestions?: string[] } = await generateStructured({
    job: 'chatExtras',
    model: options.resolved,
    instructions: chatExtrasPrompt(want, tools),
    prompt: exchangeText(options.question, options.reply),
    schema: chatExtrasSchema(want),
    usage: { category: 'chat-extras', sessionId: options.sessionId },
  });
  return {
    title: reply.title ? tidy(reply.title) || undefined : undefined,
    suggestions: (reply.suggestions ?? []).slice(0, SUGGESTION_COUNT),
  };
}
