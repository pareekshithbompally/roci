import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileUIPart } from '@shared/types';
import { messageText } from '@shared/utils/chatParts';

const persist = vi.fn().mockResolvedValue(true);
vi.mock('@services/chat.service', () => ({
  chatService: { persistSession: (...args: unknown[]) => persist(...args), renameSession: vi.fn(), deleteSession: vi.fn() },
}));

import { useChatStore, askInNewChat, injectChatRefs } from '@features/chat/stores';
import { CHAT_DRAFT_COPY } from '@config/chat.config';

const pdf: FileUIPart = { type: 'file', mediaType: 'application/pdf', url: 'data:application/pdf;base64,', filename: 'plan.pdf' };
const current = () => {
  const s = useChatStore.getState();
  return s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) : undefined;
};

describe('sending a message', () => {
  beforeEach(() => {
    persist.mockClear();
    // No model picked: the reply is the hint, so these tests stop before any AI call.
    injectChatRefs({ settings: null, providers: [] });
    useChatStore.setState({
      currentSessionId: null, loadedSessions: new Map(), input: '', pendingAttachments: [],
      selectedMeetingRefs: [], replyingSessionId: null, draftMeetingId: null,
    });
  });

  it('sends the home composer’s typed question in a new chat and clears the composer', async () => {
    useChatStore.setState({ input: 'summarise yesterday' });
    askInNewChat();
    await vi.waitFor(() => expect(current()?.messages).toHaveLength(2));

    const [question] = current()!.messages;
    expect(question.role).toBe('user');
    expect(messageText(question)).toBe('summarise yesterday');
    expect(useChatStore.getState().input).toBe('');
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ title: 'summarise yesterday' }));
  });

  it('sends an attachment with no text, titled after the file', async () => {
    useChatStore.setState({ pendingAttachments: [pdf] });
    await useChatStore.getState().sendMessage();

    const [question] = current()!.messages;
    expect(messageText(question)).toBe('');
    expect(question.parts).toEqual([{ type: 'data-sentAt', data: { at: question.metadata.createdAt } }, pdf]);
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

    const [question] = current()!.messages;
    expect(question.parts.map((p) => p.type)).toEqual(['data-sentAt', 'text']);
    expect(messageText(question)).toBe('What changed?');
    expect(question.metadata.meetingRefs).toBeUndefined();
    expect(useChatStore.getState()).toMatchObject({ input: 'half-typed', pendingAttachments: [pdf], selectedMeetingRefs: [meeting] });
  });

  it('saves once when the question is sent and once when its reply settles', async () => {
    useChatStore.setState({ input: 'hi' });
    await useChatStore.getState().sendMessage();

    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    const saved = persist.mock.calls[1][0] as { messages: { metadata: { state?: string } }[] };
    expect(saved.messages.every((m) => m.metadata.state !== 'loading' && m.metadata.state !== 'streaming')).toBe(true);
  });

  it('names an attachment with no name of its own generically', async () => {
    const clip: FileUIPart = { type: 'file', mediaType: 'audio/wav', url: 'data:audio/wav;base64,' };
    useChatStore.setState({ pendingAttachments: [clip] });
    await useChatStore.getState().sendMessage();
    expect(current()!.title).toBe(CHAT_DRAFT_COPY.untitledAttachment);
  });
});
