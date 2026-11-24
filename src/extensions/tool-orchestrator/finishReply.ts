/** The reply's own last call: finishReply names a new chat and/or suggests follow-ups. It has no execute, so the AI SDK
 *  ends the reply on it; its input is read here, and its part is never shown or saved. */

import { jsonSchema, tool, type ToolSet } from 'ai';
import { chatExtrasSchema, finishReplyDescription, FINISH_REPLY_TOOL, jsonSchemaOf, readReply } from '@core/ai';
import type { ChatExtrasWant, PromptPersonalization } from '@core/ai';
import { CHAT_TITLE_MAX_CHARS, SUGGESTION_COUNT } from '@config/chat.config';
import type { ChatPart } from '@shared/types';

export interface ChatExtras {
  /** Absent when not asked for or left empty. */
  title?: string;
  suggestions: string[];
}

const NO_EXTRAS: ChatExtras = { suggestions: [] };

/** finishReply, for a reply that wants a title or follow-ups; none when both are off. */
export function finishReplyTools(want: ChatExtrasWant, personalization?: PromptPersonalization): ToolSet {
  if (!want.title && !want.suggestions) return {};
  const inputSchema = jsonSchema(jsonSchemaOf(chatExtrasSchema(want)));
  return { [FINISH_REPLY_TOOL]: tool({ description: finishReplyDescription(want, personalization), inputSchema }) };
}

/** The reply's finishReply call. */
export const isFinishReply = (part: ChatPart): boolean => part.type === `tool-${FINISH_REPLY_TOOL}`;

/** At most `CHAT_TITLE_MAX_CHARS`, cut at a word; trailing punctuation dropped. */
const tidy = (title: string): string =>
  (title.length > CHAT_TITLE_MAX_CHARS ? title.slice(0, CHAT_TITLE_MAX_CHARS).replace(/\s+\S*$/, '') : title).replace(/[.!?…]+$/, '').trim();

/** What the reply's finishReply carried; nothing when the model didn't call it. */
export function extrasOf(parts: ChatPart[], want: ChatExtrasWant): ChatExtras {
  const part = parts.find(isFinishReply);
  if (!part || !('input' in part) || typeof part.input !== 'object' || part.input === null) return NO_EXTRAS;
  const { title, suggestions }: { title?: string; suggestions?: string[] } = readReply(chatExtrasSchema(want), part.input);
  return {
    title: title ? tidy(title) || undefined : undefined,
    suggestions: (suggestions ?? []).slice(0, SUGGESTION_COUNT),
  };
}
