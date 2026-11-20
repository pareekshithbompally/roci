/** Chat session CRUD via the unified store (roci.db). */

import type { ChatSession } from '@shared/types';
import { store } from '@services/db';
import { chatIndexer } from '@extensions/rag/chat-indexer';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';

class ChatService {
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

  /** Deletes a session with everything it owns (messages, files, search index) in one store write; throws when it fails. */
  async deleteSession(sessionId: string): Promise<void> {
    await store.chats.delete(sessionId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.gallery() });
  }

  /** Renames a session. Throws when the write fails. */
  async renameSession(sessionId: string, newTitle: string): Promise<void> {
    await store.chats.rename(sessionId, newTitle);
  }
}

export const chatService = new ChatService();
