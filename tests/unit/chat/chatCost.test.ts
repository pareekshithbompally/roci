import { describe, it, expect, vi } from 'vitest';
import type { ChatMessage } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';

vi.mock('@services/modalities', () => ({
  modalitiesService: { getPricing: (_p: string, model: string) => (model === 'flash' ? { inputPer1M: 1, outputPer1M: 2 } : null) },
}));

import { chatCostOf } from '@features/chat/hooks/useChatCost';

const reply = (id: string, provider: string, model: string, tokens?: number): ChatMessage => ({
  id, role: 'model', text: '', timestamp: 0, provider, model,
  ...(tokens !== undefined && { usage: { inputTokens: tokens, outputTokens: tokens } }),
});
const question: ChatMessage = { id: 'q', role: 'user', text: 'hi', timestamp: 0 };

describe('chatCostOf', () => {
  it('sums the replies by the price rule, counting the ones with no price', () => {
    const messages = [question, reply('a', 'gemini', 'flash', 1_000_000), reply('b', 'openrouter', 'mystery', 10), reply('c', 'on-device', 'gemma', 10)];
    expect(chatCostOf([], messages)).toEqual({ total: 3, unpriced: 1 });
  });

  it('uses a price the user set later, so old replies show it', () => {
    const priced = [{ provider: 'openrouter', active: true, models: [{ id: 'mystery', price: { inputPer1M: 1_000_000, outputPer1M: 0 } }] }] as ModelProvider[];
    expect(chatCostOf(priced, [reply('b', 'openrouter', 'mystery', 10)])).toEqual({ total: 10, unpriced: 0 });
  });

  it('is nothing before any reply recorded its tokens', () => {
    expect(chatCostOf([], [question, reply('x', 'gemini', 'flash')])).toBeNull();
  });
});
