/** What the composer holds before it's sent: its text and attachments. One rule for every composer and the store. */

import type { ChatPart } from '@shared/types';
import { CHAT_DRAFT_COPY, CHAT_TITLE_MAX_CHARS } from '@config/chat.config';

/** A draft can go once it has words or an attachment. */
export function canSendDraft(text: string, attachments: readonly ChatPart[]): boolean {
  return text.trim().length > 0 || attachments.length > 0;
}

/** An attachment's own name, when it has one. */
function attachmentName(part: ChatPart): string | undefined {
  if (part.type === 'document') return part.fileName;
  if (part.type === 'image' || part.type === 'video') return part.alt;
  return undefined;
}

/** A new chat's title until the model names it: the question's start, else the first attachment's name. */
export function draftTitle(text: string, attachments: readonly ChatPart[]): string {
  const words = text.trim();
  if (words) return words.slice(0, CHAT_TITLE_MAX_CHARS);
  const first = attachments[0];
  return (first && attachmentName(first)) || CHAT_DRAFT_COPY.untitledAttachment;
}
