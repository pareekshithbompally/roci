/** A meeting chat while its meeting records: every question brings the meeting, so each sees the transcript as it is now. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@shared/types';

vi.mock('@services/chat.service', () => ({ chatService: { persistSession: vi.fn(async () => undefined), renameSession: vi.fn(), deleteSession: vi.fn() } }));
vi.mock('@shared/utils/modelResolver', () => ({ resolveChatModel: () => ({ provider: 'openai', modelId: 'm', model: {} }) }));
const resolve = vi.hoisted(() => vi.fn(async (_input: { meetingIds: string[] }) => ({ text: '' })));
vi.mock('@extensions/context-pipeline', () => ({ contextPipeline: { resolve } }));
vi.mock('@extensions/usage', () => ({ logUsage: async () => undefined }));
vi.mock('@extensions/rag', () => ({ indexStretch: vi.fn(async () => []) }));
vi.mock('@shared/query/memories', () => ({ memoriesQuery: { queryKey: ['memories'], queryFn: async () => ({ entities: [], memories: [] }) } }));
vi.mock('@shared/query/items', () => ({
  itemCountsQuery: { queryKey: ['meetings', 'items', 'counts'], queryFn: async () => ({ meetings: 0, chats: 0 }) },
  itemEdits: { rename: async () => undefined, remove: async () => undefined },
  refreshItems: () => undefined,
}));
vi.mock('@shared/utils/appEvents', () => ({ notifyAppEvent: vi.fn() }));
vi.mock('@extensions/tool-orchestrator', () => ({
  orchestrate: async () => ({ provider: 'openai', model: 'm', parts: [{ type: 'text', text: 'ok' }], extras: Promise.resolve({ suggestions: [] }) }),
}));

// eslint-disable-next-line import/first
import { useChatStore, injectChatRefs } from '@features/chat/stores/chatStore';
// eslint-disable-next-line import/first
import { meetingLiveActions } from '@features/recording/live/meetingLiveStore';

const settings = { chatModel: 'm', transcriptionModel: '', apiKey: '' } as AppSettings;

async function send(text: string): Promise<void> {
  useChatStore.setState({ input: text });
  await useChatStore.getState().sendMessage();
}

beforeEach(() => {
  resolve.mockClear();
  injectChatRefs({ settings, providers: [] });
  useChatStore.setState({ loadedSessions: new Map(), replyingSessionId: null, currentSessionId: null, input: '' });
});

describe('a meeting chat', () => {
  it('brings its meeting with every question while the meeting records, and only the attached ones after', async () => {
    meetingLiveActions.start('m1');
    useChatStore.getState().startMeetingChat({ id: 'm1', title: 'Sync', timestamp: 0 });
    await send('what was decided?');
    await send('and who owns it?');
    expect(resolve.mock.calls.map(([input]) => input.meetingIds)).toEqual([['m1'], ['m1']]);

    meetingLiveActions.end();
    await send('anything else?');
    expect(resolve.mock.calls[2][0].meetingIds).toEqual([]);
  });
});
