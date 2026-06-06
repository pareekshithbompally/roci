/**
 * Chat Service
 * Chat session CRUD via index + session repositories.
 */

import type { ChatSession, ChatMessage, ChatIndexEntry } from '@shared/types';
import { chatIndexRepository } from './repositories/chat-index.repository';
import { chatSessionRepository } from './repositories/chat-session.repository';
import type { StoredChatSession } from './repositories/chat-session.repository';
import { chatIndexer } from '@extensions/rag/chat-indexer';

class ChatService {
  /** List sessions from the index (lightweight — no messages) */
  async listSessions(): Promise<ChatIndexEntry[]> {
    return chatIndexRepository.loadIndex();
  }

  /** Load a full session with messages */
  async loadSession(sessionId: string): Promise<ChatSession | null> {
    const stored = await chatSessionRepository.loadSession(sessionId);
    if (!stored) return null;
    return {
      id: stored.id,
      title: stored.title,
      lastMessageAt: stored.lastMessageAt,
      messages: stored.messages,
    };
  }

  /** Persist a session — writes session file + updates index */
  async persistSession(session: ChatSession): Promise<boolean> {
    const stored: StoredChatSession = {
      id: session.id,
      title: session.title,
      lastMessageAt: session.lastMessageAt,
      messages: session.messages,
    };

    const ok = await chatSessionRepository.saveSession(stored);
    if (!ok) return false;

    // Update or add to index
    const existing = await chatIndexRepository.getFromIndex(session.id);
    const indexEntry: ChatIndexEntry = {
      id: session.id,
      title: session.title,
      lastMessageAt: session.lastMessageAt,
      messageCount: session.messages.length,
    };

    if (existing) {
      await chatIndexRepository.updateInIndex(session.id, indexEntry);
    } else {
      await chatIndexRepository.addToIndex(indexEntry);
    }

    // Fire-and-forget: index session into vector DB asynchronously
    chatIndexer.indexSession(session).catch(err =>
      console.error('[ChatService] Chat indexing failed (non-fatal):', session.id, err)
    );

    return true;
  }

  /** Delete a session — removes from index + deletes session file */
  async deleteSession(sessionId: string): Promise<boolean> {
    const [indexOk, sessionOk] = await Promise.all([
      chatIndexRepository.removeFromIndex(sessionId),
      chatSessionRepository.deleteSession(sessionId),
    ]);
    if (!indexOk || !sessionOk) {
      console.warn('[ChatService] Partial deletion of chat session:', sessionId, { indexOk, sessionOk });
    }
    // Fire-and-forget: remove from vector index
    chatIndexer.removeSession(sessionId).catch(err =>
      console.warn('[ChatService] Chat index cleanup failed (non-fatal):', sessionId, err)
    );
    return indexOk && sessionOk;
  }

  /** Rename a session — updates index + session file title */
  async renameSession(sessionId: string, newTitle: string): Promise<boolean> {
    await chatIndexRepository.updateInIndex(sessionId, { title: newTitle });
    const stored = await chatSessionRepository.loadSession(sessionId);
    if (stored) {
      stored.title = newTitle;
      await chatSessionRepository.saveSession(stored);
    }
    return true;
  }
}

export const chatService = new ChatService();
