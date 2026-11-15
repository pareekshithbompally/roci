/** Chat session CRUD via the unified store (kasset.db). */

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

  /** Persist a session — writes to store + fire-and-forget RAG indexing */
  async persistSession(session: ChatSession): Promise<boolean> {
    try {
      await store.chats.upsert(session);
    } catch (error) {
      console.error('[ChatService] Persist failed:', error);
      return false;
    }

    // Fire-and-forget: index session into vector DB asynchronously
    chatIndexer.indexSession(session).catch(err =>
      console.error('[ChatService] Chat indexing failed (non-fatal):', session.id, err)
    );

    return true;
  }

  /** Delete a session — removes from store + fire-and-forget RAG cleanup */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await store.chats.delete(sessionId);
    } catch (error) {
      console.error('[ChatService] Delete failed:', error);
      return false;
    }

    // Fire-and-forget: remove from vector index
    chatIndexer.removeSession(sessionId).catch(err =>
      console.warn('[ChatService] Chat index cleanup failed (non-fatal):', sessionId, err)
    );

    return true;
  }

  /** Rename a session — updates store */
  async renameSession(sessionId: string, newTitle: string): Promise<boolean> {
    try {
      await store.chats.rename(sessionId, newTitle);
      return true;
    } catch (error) {
      console.error('[ChatService] Rename failed:', error);
      return false;
    }
  }
}

export const chatService = new ChatService();
