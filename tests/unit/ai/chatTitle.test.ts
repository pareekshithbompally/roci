import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';

const model = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@extensions/usage', () => ({ recordUsage: vi.fn() }));
vi.mock('@services/ai/provider', () => ({ createModel: () => model.current }));

import { generateChatTitle } from '@services/ai/chatTitle';
import { recordUsage } from '@extensions/usage';

const resolved = { modelId: 'm', provider: 'openai', apiKey: 'k', baseUrl: '', model: 'm', providerConfig: {} } as never;
const replying = (text: string) => new MockLanguageModelV4({
  doGenerate: async () => ({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 2, text: 2, reasoning: 0 } }, warnings: [] }) as never,
});

describe('generateChatTitle', () => {
  it('names the chat from the title field and records its usage under the chat', async () => {
    model.current = replying('{"title":"Q3 launch plan."}');
    expect(await generateChatTitle({ resolved, question: 'When do we launch?', reply: 'In Q3.', sessionId: 'c1' })).toBe('Q3 launch plan');
    expect(recordUsage).toHaveBeenCalledWith('title-gen', resolved, expect.anything(), 'c1');
  });

  it('keeps the start of the question when naming fails', async () => {
    model.current = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('offline'); } });
    expect(await generateChatTitle({ resolved, question: 'When do we launch?', reply: 'In Q3.', sessionId: 'c1' })).toBe('When do we launch');
  });
});
