/** Chats domain — list/get/upsert/rename/delete chat sessions. */

import { call, rowToMessage, toRowRole } from '@services/db/internal';
import type { ChatMessageRow } from '@services/db/internal';
import type { ChatMessage, ChatSession } from '@shared/types';
import { generatedImageOf, isAssetPath, messageText } from '@shared/utils/chatParts';

/** Every kept file the messages show (images tools made, files attached): the chat owns exactly these. */
function assetPathsOf(messages: ChatMessage[]): string[] {
  return messages.flatMap((msg) => msg.parts.flatMap((part) => {
    if (part.type === 'file') return isAssetPath(part.url) ? [part.url] : [];
    return generatedImageOf(part)?.path ?? [];
  }));
}

/** A message as its row: the plain text (search reads it), provider and model as columns, parts and metadata whole in `data`. */
function messageRow({ id, role, parts, metadata }: ChatMessage) {
  return {
    id,
    role: toRowRole(role),
    text: messageText({ parts }),
    provider: metadata.provider ?? null,
    model: metadata.model ?? null,
    data: JSON.stringify({ parts, metadata }),
    created_at: metadata.createdAt,
  };
}

export const chats = {
  /** Get a full chat session with messages. */
  async get(id: string): Promise<ChatSession> {
    const result = await call<{
      id: string;
      title: string;
      meeting_id: string | null;
      last_message_at: number;
      messages: ChatMessageRow[];
    }>('chats_get', { id });

    return {
      id: result.id,
      title: result.title,
      lastMessageAt: result.last_message_at,
      meetingId: result.meeting_id ?? undefined,
      messages: result.messages.map(rowToMessage),
    };
  },

  /** Upsert a chat session — replaces all messages transactionally. */
  async upsert(session: ChatSession): Promise<void> {
    await call<void>('chats_upsert', {
      input: {
        id: session.id,
        title: session.title,
        meeting_id: session.meetingId ?? null,
        last_message_at: session.lastMessageAt,
        asset_paths: assetPathsOf(session.messages),
        messages: session.messages.map(messageRow),
      },
    });
  },

  /** Rename a chat session. */
  async rename(id: string, title: string): Promise<void> {
    await call<void>('chats_rename', { id, title });
  },

  /** Delete a chat session (messages, chunks, vecs cascade). */
  async delete(id: string): Promise<void> {
    await call<void>('chats_delete', { id });
  },
};
