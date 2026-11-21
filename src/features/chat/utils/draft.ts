/** What the composer holds before it's sent: its text and attachments. One rule for every composer and the store. */

import type { FileUIPart } from '@shared/types';
import { CHAT_DRAFT_COPY, CHAT_TITLE_MAX_CHARS } from '@config/chat.config';

/** A draft can go once it has words or an attachment. */
export function canSendDraft(text: string, attachments: readonly FileUIPart[]): boolean {
  return text.trim().length > 0 || attachments.length > 0;
}

/** A new chat's title until the model names it: the question's start, else the first attachment's name. */
export function draftTitle(text: string, attachments: readonly FileUIPart[]): string {
  const words = text.trim();
  if (words) return words.slice(0, CHAT_TITLE_MAX_CHARS);
  const first = attachments[0];
  return first?.filename || CHAT_DRAFT_COPY.untitledAttachment;
}
