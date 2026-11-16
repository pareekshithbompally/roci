import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatStore, useChatReasoningEffort } from '@features/chat/stores/chatStore';
import type { ChatSession } from '@shared/types';

const session: ChatSession = { id: 's1', title: 'Chat', lastMessageAt: 1, messages: [] };
/** What the composer's thinking control shows, read through its own hook. */
const effortNow = () => renderHook(() => useChatReasoningEffort()).result.current;

describe('per-chat thinking level', () => {
  beforeEach(() => {
    useChatStore.getState().setLoadedSessions(() => new Map());
    useChatStore.setState({ currentSessionId: null, draftReasoningEffort: 'provider-default' });
  });

  it('holds the level picked before a new chat exists, and New chat starts again at Default', () => {
    useChatStore.getState().setReasoningEffort('high');
    expect(effortNow()).toBe('high');
    useChatStore.getState().newChat();
    expect(effortNow()).toBe('provider-default');
  });

  it('saves the level with the current chat', () => {
    const persistSession = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({ persistSession });
    useChatStore.getState().setLoadedSessions(() => new Map([[session.id, session]]));
    useChatStore.setState({ currentSessionId: session.id });

    useChatStore.getState().setReasoningEffort('none');

    expect(effortNow()).toBe('none');
    expect(persistSession).toHaveBeenCalledWith({ ...session, reasoningEffort: 'none' });
    expect(useChatStore.getState().draftReasoningEffort).toBe('provider-default');
  });
});
