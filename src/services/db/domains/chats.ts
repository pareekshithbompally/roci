/** Chats domain — list/get/upsert/rename/delete chat sessions. */

import { call, extractDataBlob, rowToMessage } from '@services/db/internal';
import type { ChatMessage, ChatSession, ChatIndexEntry } from '@shared/types';
import type { PaginatedResult } from '@services/db/types';
import { appFileOf } from '@shared/utils/chatParts';

/** Every app-data file the messages show (images, speech…): the chat owns exactly these. */
function assetPathsOf(messages: ChatMessage[]): string[] {
  return messages.flatMap((msg) => (msg.parts ?? []).map(appFileOf).filter((path): path is string => path !== null));
}

export const chats = {
  /** List chat sessions, ordered by last_message_at DESC. */
  async list(limit = 50, offset = 0): Promise<PaginatedResult<ChatIndexEntry>> {
    const result = await call<{
      items: Array<{ id: string; title: string; last_message_at: number; message_count: number }>;
      total: number;
    }>('chats_list', { limit, offset });

    return {
      items: result.items.map((item) => ({
        id: item.id,
        title: item.title,
        lastMessageAt: item.last_message_at,
        messageCount: item.message_count,
      })),
      total: result.total,
    };
  },

  /** Get a full chat session with messages. */
  async get(id: string): Promise<ChatSession> {
    const result = await call<{
      id: string;
      title: string;
      meeting_id: string | null;
      last_message_at: number;
      messages: Array<{
        id: string;
        seq: number;
        role: string;
        text: string;
        provider: string | null;
        model: string | null;
        data: string | null;
        created_at: number;
      }>;
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
        messages: session.messages.map((msg) => {
          const data = extractDataBlob(msg);
          return {
            id: msg.id,
            role: msg.role,
            text: msg.text,
            provider: msg.provider ?? null,
            model: msg.model ?? null,
            data: data ? JSON.stringify(data) : null,
            created_at: msg.timestamp,
          };
        }),
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
