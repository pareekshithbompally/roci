/** Loaded chats in memory, and the one save path: given the chat store, so neither imports the other. */

import type { StoreApi } from 'zustand';
import type { ChatMessage, ChatMetadata, ChatPart, ChatSession } from '@shared/types';
import type { ChatStoreState } from './chatStore';
import { isUnsettled, withMetadata } from './chatMessages';

export function createSessions(store: StoreApi<ChatStoreState>) {
  const sessionOf = (id: string): ChatSession | undefined => store.getState().loadedSessions.get(id);

  /** Puts a session into the in-memory map, replacing the old copy (no save). */
  const putSession = (session: ChatSession): void =>
    store.setState((state) => ({ loadedSessions: new Map(state.loadedSessions).set(session.id, session) }));

  /** Changes one message of a loaded session in memory; returns the updated session. */
  function patchMessage(sessionId: string, messageId: string, patch: (message: ChatMessage) => ChatMessage): ChatSession | undefined {
    const session = sessionOf(sessionId);
    if (!session) return undefined;
    const updated = { ...session, messages: session.messages.map((m) => (m.id === messageId ? patch(m) : m)) };
    putSession(updated);
    return updated;
  }

  /** A reply settled with these parts and metadata. */
  const settle = (sessionId: string, messageId: string, parts: ChatPart[], metadata: Partial<ChatMetadata> = {}): ChatSession | undefined =>
    patchMessage(sessionId, messageId, (m) => ({ ...withMetadata(m, { ...metadata, state: 'complete' }), parts }));

  /** The one save path, used whenever a message settles. Disk only ever holds settled messages. */
  function saveSession(session: ChatSession | undefined): void {
    if (!session) return;
    void store.getState().persistSession({ ...session, messages: session.messages.filter((m) => !isUnsettled(m)) });
  }

  return { sessionOf, putSession, patchMessage, settle, saveSession };
}

export type Sessions = ReturnType<typeof createSessions>;
