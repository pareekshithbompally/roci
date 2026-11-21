import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppSettings, ChatPart, ChatSession } from '@shared/types';
import { messageText } from '@shared/utils/chatParts';

const persist = vi.fn().mockResolvedValue(undefined);
vi.mock('@services/chat.service', () => ({
  chatService: { persistSession: (...args: unknown[]) => persist(...args), renameSession: vi.fn(), deleteSession: vi.fn() },
}));
vi.mock('@shared/utils/modelResolver', () => ({ resolveChatModel: () => ({ provider: 'openai', modelId: 'm', model: {} }) }));
vi.mock('@extensions/context-pipeline', () => ({ contextPipeline: { resolve: async () => ({ text: '' }) } }));
vi.mock('@services/ai/chatExtras', () => ({ generateChatExtras: async () => ({ suggestions: [] }) }));
vi.mock('@extensions/usage', () => ({ logUsage: async () => undefined }));
vi.mock('@shared/query/items', () => ({
  itemCountsQuery: { queryKey: ['meetings', 'items', 'counts'], queryFn: async () => ({ meetings: 0, chats: 0 }) },
  itemEdits: { rename: async () => undefined, remove: async () => undefined },
  refreshItems: () => undefined,
}));
vi.mock('@services/unifiedAIService', () => ({ unifiedAIService: { generateTitle: async () => ({ title: 'Titled' }) } }));
const notify = vi.fn();
vi.mock('@shared/utils/appEvents', () => ({ notifyAppEvent: (...args: unknown[]) => notify(...args) }));

/** A stream the test drives: the reply's words so far, then finish (normally, as the SDK does after an abort) or fail. */
type Callbacks = { onParts: (parts: ChatPart[]) => void };
interface Stream { say: (text: string) => void; show: (parts: ChatPart[]) => void; finish: () => void; fail: (e: Error) => void }
const streams: Stream[] = [];
vi.mock('@extensions/tool-orchestrator', () => ({
  orchestrate: (_req: unknown, callbacks: Callbacks) =>
    new Promise((resolve, reject) => {
      let parts: ChatPart[] = [];
      streams.push({
        say: (text) => callbacks.onParts((parts = [{ type: 'text', text }])),
        show: (next) => callbacks.onParts((parts = next)),
        finish: () => resolve({ provider: 'openai', model: 'm', tokenUsage: undefined, parts }),
        fail: reject,
      });
    }),
}));

import { useChatStore, injectChatRefs } from '@features/chat/stores/chatStore';

const settings = { chatModel: 'm', transcriptionModel: '', apiKey: '' } as AppSettings;
const sessionOf = (id: string) => useChatStore.getState().loadedSessions.get(id) as ChatSession;
const replyOf = (id: string) => {
  const reply = sessionOf(id).messages.at(-1)!;
  return { text: messageText(reply), ...reply.metadata };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Sends `text` in a new chat and waits until its stream is open. */
async function ask(text: string): Promise<string> {
  useChatStore.setState({ currentSessionId: null, input: text });
  void useChatStore.getState().sendMessage();
  await vi.waitFor(() => expect(streams.length).toBeGreaterThan(0));
  return useChatStore.getState().currentSessionId!;
}

describe('stopping a reply', () => {
  beforeEach(() => {
    streams.length = 0;
    persist.mockClear();
    notify.mockClear();
    injectChatRefs({ settings, providers: [] });
    useChatStore.setState({ loadedSessions: new Map(), replyingSessionId: null, currentSessionId: null, input: '' });
  });

  it('keeps what was written, saves it once, and ignores the request finishing afterwards', async () => {
    const id = await ask('hi');
    streams[0].say('Hello');
    useChatStore.getState().stopGeneration();
    expect(replyOf(id)).toMatchObject({ text: 'Hello', state: 'complete' });
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2)); // the question, then the stopped reply

    persist.mockClear();
    streams[0].finish();
    await flush();
    expect(replyOf(id).text).toBe('Hello');
    expect(persist).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(useChatStore.getState().replyingSessionId).toBeNull();
  });

  it('stops the chat that is replying, even with another chat open', async () => {
    const id = await ask('hi');
    useChatStore.setState({ currentSessionId: 'other' });
    useChatStore.getState().stopGeneration();
    expect(replyOf(id)).toMatchObject({ text: '[Stopped]', state: 'complete' });
  });

  it('keeps a stopped request’s late words out of the next reply', async () => {
    const first = await ask('one');
    useChatStore.getState().stopGeneration();
    const second = await ask('two');
    await vi.waitFor(() => expect(streams).toHaveLength(2));

    streams[0].say('stale');
    streams[1].say('fresh');
    streams[1].finish();
    await vi.waitFor(() => expect(replyOf(second).state).toBe('complete'));
    expect(replyOf(second).text).toBe('fresh');
    expect(replyOf(first).text).toBe('[Stopped]');
  });

  it('keeps saying what is under way until something shows (an empty block opened first is not a word)', async () => {
    const id = await ask('hi');
    streams[0].show([{ type: 'step-start' }, { type: 'text', text: '' }]);
    expect(replyOf(id).state).toBe('loading');
    streams[0].say('Hello');
    expect(replyOf(id).state).toBe('streaming');
  });

  it('keeps the work a reply showed when stopped, without a "[Stopped]" line under it', async () => {
    const id = await ask('hi');
    const tool: ChatPart = { type: 'tool-search_meetings', toolCallId: 't1', state: 'input-available', input: {} };
    streams[0].show([{ type: 'step-start' }, tool]);
    useChatStore.getState().stopGeneration();
    expect(sessionOf(id).messages.at(-1)!.parts).toEqual([{ type: 'step-start' }, tool]);
  });

  it('saves a failed reply with its reason', async () => {
    const id = await ask('hi');
    streams[0].fail(new Error('rate limited'));
    await vi.waitFor(() => expect(replyOf(id)).toMatchObject({ text: 'rate limited', isError: true, state: 'complete' }));
    expect(useChatStore.getState().replyingSessionId).toBeNull();
  });

  it('never writes a reply in progress to disk', async () => {
    await ask('hi');
    for (const [saved] of persist.mock.calls as [ChatSession][]) {
      expect(saved.messages.some((m) => m.metadata.state === 'loading' || m.metadata.state === 'streaming')).toBe(false);
    }
  });
});
