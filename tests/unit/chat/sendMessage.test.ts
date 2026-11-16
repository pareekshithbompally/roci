import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatPart } from '@shared/types';

const persist = vi.fn().mockResolvedValue(true);
vi.mock('@services/chat.service', () => ({
  chatService: { persistSession: (...args: unknown[]) => persist(...args), renameSession: vi.fn(), deleteSession: vi.fn() },
}));

import { useChatStore, askInNewChat, injectChatRefs } from '@features/chat/stores/chatStore';
import { CHAT_DRAFT_COPY } from '@config/chat.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import type { ChatIndexEntry } from '@shared/types';

const pdf: ChatPart = { type: 'document', mimeType: 'application/pdf', source: { kind: 'data', base64: '' }, fileName: 'plan.pdf' };
const current = () => {
  const s = useChatStore.getState();
  return s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) : undefined;
};

describe('sending a message', () => {
  beforeEach(() => {
    persist.mockClear();
    // No model picked: the reply is the hint, so these tests stop before any AI call.
    injectChatRefs({ settings: null, providers: [], historyItems: [] });
    useChatStore.setState({
      currentSessionId: null, loadedSessions: new Map(), input: '', pendingAttachments: [],
      selectedMeetingRefs: [], replyingSessionId: null, draftMeetingId: null,
    });
    queryClient.setQueryData(queryKeys.chats(), []);
  });

  it('sends the home composer’s typed question in a new chat and clears the composer', async () => {
    useChatStore.setState({ input: 'summarise yesterday' });
    askInNewChat();
    await vi.waitFor(() => expect(current()?.messages).toHaveLength(2));

    const [question] = current()!.messages;
    expect(question).toMatchObject({ role: 'user', text: 'summarise yesterday' });
    expect(useChatStore.getState().input).toBe('');
    expect(queryClient.getQueryData<ChatIndexEntry[]>(queryKeys.chats())?.[0].title).toBe('summarise yesterday');
  });

  it('sends an attachment with no text, titled after the file', async () => {
    useChatStore.setState({ pendingAttachments: [pdf] });
    await useChatStore.getState().sendMessage();

    const [question] = current()!.messages;
    expect(question.text).toBe('');
    expect(question.parts).toEqual([pdf]);
    expect(current()!.title).toBe('plan.pdf');
    expect(useChatStore.getState().pendingAttachments).toEqual([]);
  });

  it('sends nothing for an empty draft', async () => {
    useChatStore.setState({ input: '   ' });
    await useChatStore.getState().sendMessage();
    expect(useChatStore.getState().currentSessionId).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });

  it('sends a suggestion without taking the draft the user is building', async () => {
    const meeting = { id: 'm1', title: 'Weekly', timestamp: 1 };
    useChatStore.setState({ input: 'half-typed', pendingAttachments: [pdf], selectedMeetingRefs: [meeting] });
    await useChatStore.getState().sendMessage('What changed?');

    expect(current()!.messages[0]).toMatchObject({ text: 'What changed?', parts: undefined, meetingRefs: undefined });
    expect(useChatStore.getState()).toMatchObject({ input: 'half-typed', pendingAttachments: [pdf], selectedMeetingRefs: [meeting] });
  });

  it('saves once when the question is sent and once when its reply settles', async () => {
    useChatStore.setState({ input: 'hi' });
    await useChatStore.getState().sendMessage();

    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    const saved = persist.mock.calls[1][0] as { messages: { state?: string }[] };
    expect(saved.messages.every((m) => m.state !== 'loading' && m.state !== 'streaming')).toBe(true);
  });

  it('names an attachment with no name of its own generically', async () => {
    const clip: ChatPart = { type: 'audio', mimeType: 'audio/wav', source: { kind: 'data', base64: '' } };
    useChatStore.setState({ pendingAttachments: [clip] });
    await useChatStore.getState().sendMessage();
    expect(current()!.title).toBe(CHAT_DRAFT_COPY.untitledAttachment);
  });
});
