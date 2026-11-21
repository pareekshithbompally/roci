/** Chat messages as the store builds them: a question, an attachment, a reply's metadata, Roci's own notices. Pure. */

import type { ChatMessage, ChatMetadata, FileUIPart } from '@shared/types';
import type { MeetingListItem } from '@services/meetingReferenceService';
import type { ModelRef } from '@services/ai/models';

/** What one send carries. */
export interface Question {
  text: string;
  attachments: FileUIPart[];
  meetings: MeetingListItem[];
}

/** What a reply stopped before its first word says. */
export const STOPPED_REPLY = '[Stopped]';
export const NO_MODEL_REPLY = 'Please select a model from the picker in the toolbar before sending a message.';
export const lockedModelGoneReply = ({ model }: ModelRef) =>
  `This chat runs on ${model}, which isn't available now. Start a new chat to use another model.`;

/** The question as a message: when it was sent (for the model), its text, then its attachments and chosen meetings. */
export function questionMessage({ text, attachments, meetings }: Question): ChatMessage {
  const now = Date.now();
  return {
    id: now.toString(),
    role: 'user',
    parts: [{ type: 'data-sentAt', data: { at: now } }, ...(text ? [{ type: 'text' as const, text }] : []), ...attachments],
    metadata: {
      createdAt: now,
      ...(meetings.length > 0 && { meetingRefs: meetings.map((m) => ({ id: m.id, title: m.title })) }),
    },
  };
}

/** An attachment as the AI SDK's file part: the file inline as a data URL, with its name. */
export function attachmentPart(mediaType: string, url: string, filename: string): FileUIPart {
  return { type: 'file', mediaType, url, filename };
}

export const withMetadata = (message: ChatMessage, metadata: Partial<ChatMetadata>): ChatMessage =>
  ({ ...message, metadata: { ...message.metadata, ...metadata } });

/** The question's attached meetings, as the model reads them on this and every later turn. */
export const withMeetings = (message: ChatMessage, context: string): ChatMessage =>
  ({ ...message, parts: [...message.parts, { type: 'data-meetings', data: { context } }] });

export const isUnsettled = ({ metadata }: ChatMessage): boolean => metadata.state === 'loading' || metadata.state === 'streaming';

/** Earlier replies' follow-up suggestions go once a new question is asked. */
export const withoutSuggestions = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) => {
    if (!message.metadata.suggestions?.length) return message;
    const { suggestions: _, ...metadata } = message.metadata;
    return { ...message, metadata };
  });

/** Output tokens per second of streamed text, when it streamed long enough to measure. */
export function tokensPerSecond(tokens: number | undefined, firstTextAt: number): number | undefined {
  const seconds = firstTextAt > 0 ? (Date.now() - firstTextAt) / 1000 : 0;
  return tokens && seconds > 0.05 ? Math.round(tokens / seconds) : undefined;
}
