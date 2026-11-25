/** A reply's title and follow-ups: one short structured call to the chat's own model once the reply is done, given only the
 *  user's last message and the reply's text. Its failure is logged and gives none; the reply itself is never touched. */

import { chatExtrasInput, chatExtrasInstructions, chatExtrasSchema } from '@core/ai';
import type { ChatExtrasWant, PromptPersonalization } from '@core/ai';
import { generateStructured } from '@services/ai/structured';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { CHAT_TITLE_MAX_CHARS, SUGGESTION_COUNT } from '@config/chat.config';

export interface ChatExtras {
  /** Absent when not asked for or left empty. */
  title?: string;
  suggestions: string[];
}

export const NO_EXTRAS: ChatExtras = { suggestions: [] };

export interface ExtrasRequest {
  /** The chat's model, as the reply ran on it. */
  model: ResolvedModel;
  want: ChatExtrasWant;
  personalization?: PromptPersonalization;
  /** The user's last message and the reply, as text. */
  question: string;
  answer: string;
  /** The chat, for the usage row. */
  sessionId: string;
  /** The reply's own: Stop, the chat's next message or its delete ends the call. */
  signal?: AbortSignal;
}

/** At most `CHAT_TITLE_MAX_CHARS`, cut at a word; trailing punctuation dropped. */
const tidy = (title: string): string =>
  (title.length > CHAT_TITLE_MAX_CHARS ? title.slice(0, CHAT_TITLE_MAX_CHARS).replace(/\s+\S*$/, '') : title).replace(/[.!?…]+$/, '').trim();

/** Asks for exactly what `want` names; nothing (and no call) when both are off; never rejects. */
export async function askChatExtras({ model, want, personalization, question, answer, sessionId, signal }: ExtrasRequest): Promise<ChatExtras> {
  if (!want.title && !want.suggestions) return NO_EXTRAS;
  try {
    const { title, suggestions }: { title?: string; suggestions?: string[] } = await generateStructured({
      job: 'chat',
      model,
      instructions: chatExtrasInstructions(want, personalization),
      prompt: chatExtrasInput(question, answer),
      schema: chatExtrasSchema(want),
      usage: { category: 'chat', sessionId },
      signal,
    });
    return { title: title ? tidy(title) || undefined : undefined, suggestions: (suggestions ?? []).slice(0, SUGGESTION_COUNT) };
  } catch (error: unknown) {
    if (!signal?.aborted) console.error('[ChatExtras] Title and follow-ups failed:', error);
    return NO_EXTRAS;
  }
}
