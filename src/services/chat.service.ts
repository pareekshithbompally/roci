/** Chat session CRUD via the unified store (roci.db). */

import type { ChatSession, ChatIndexEntry } from '@shared/types';
import { store } from '@services/db';
import { chatIndexer } from '@extensions/rag/chat-indexer';

class ChatService {
  /** List sessions from the store (lightweight — no messages) */
  async listSessions(): Promise<ChatIndexEntry[]> {
    const result = await store.chats.list(500, 0);
    return result.items;
  }

  /** Load a full session with messages */
  async loadSession(sessionId: string): Promise<ChatSession | null> {
    try {
      return await store.chats.get(sessionId);
    } catch {
      return null;
    }
  }

  /** Writes a session; the vector index follows in the background. Throws when the write fails. */
  async persistSession(session: ChatSession): Promise<void> {
    await store.chats.upsert(session);
    chatIndexer.indexSession(session).catch((error: unknown) =>
      console.error('[ChatService] Chat indexing failed (non-fatal):', session.id, error)
    );
  }

  /** Deletes a session; its vector index entries go in the background. Throws when the delete fails. */
  async deleteSession(sessionId: string): Promise<void> {
    await store.chats.delete(sessionId);
    chatIndexer.removeSession(sessionId).catch((error: unknown) =>
      console.warn('[ChatService] Chat index cleanup failed (non-fatal):', sessionId, error)
    );
  }

  /** Renames a session. Throws when the write fails. */
  async renameSession(sessionId: string, newTitle: string): Promise<void> {
    await store.chats.rename(sessionId, newTitle);
  }
}

export const chatService = new ChatService();
