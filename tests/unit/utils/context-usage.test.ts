import { describe, it, expect } from 'vitest';
import {
  deriveContextUsage,
  contextLevelFor,
  CONTEXT_WARNING_PERCENT,
  CONTEXT_CRITICAL_PERCENT,
} from '@shared/hooks/useContextUsage';
import type { ChatMessage } from '@shared/types';

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'model',
    text: 'hello',
    timestamp: 0,
    state: 'complete',
    ...overrides,
  };
}

describe('contextLevelFor', () => {
  it('is ok below the warning threshold', () => {
    expect(contextLevelFor(CONTEXT_WARNING_PERCENT - 1)).toBe('ok');
  });

  it('warns at exactly the warning threshold', () => {
    expect(contextLevelFor(CONTEXT_WARNING_PERCENT)).toBe('warning');
  });

  it('is critical at exactly the critical threshold', () => {
    expect(contextLevelFor(CONTEXT_CRITICAL_PERCENT)).toBe('critical');
  });
});

describe('deriveContextUsage', () => {
  it('returns null when the context total is unknown', () => {
    const messages = [msg({ inputTokenCount: 100, tokenCount: 50 })];
    expect(deriveContextUsage(messages, null)).toBeNull();
    expect(deriveContextUsage(messages, 0)).toBeNull();
  });

  it('returns null when no message has usage yet', () => {
    expect(deriveContextUsage([msg()], 1000)).toBeNull();
    expect(deriveContextUsage([], 1000)).toBeNull();
  });

  it('measures the last assistant turn against the total', () => {
    const messages = [
      msg({ id: 'a', inputTokenCount: 200, tokenCount: 100 }),
      msg({ id: 'b', inputTokenCount: 800, tokenCount: 200 }),
    ];
    const usage = deriveContextUsage(messages, 2000);
    expect(usage).toMatchObject({
      total: 2000,
      used: 1000,
      percent: 50,
      level: 'ok',
      currentInput: 800,
      currentOutput: 200,
    });
  });

  it('sums usage across turns for the cumulative figures', () => {
    const messages = [
      msg({ id: 'a', inputTokenCount: 200, tokenCount: 100 }),
      msg({ id: 'b', inputTokenCount: 800, tokenCount: 200 }),
    ];
    const usage = deriveContextUsage(messages, 4000);
    expect(usage).toMatchObject({ cumulativeInput: 1000, cumulativeOutput: 300 });
  });

  it('clamps cached tokens to the current input', () => {
    const usage = deriveContextUsage(
      [msg({ inputTokenCount: 500, tokenCount: 50, cacheReadTokens: 900 })],
      2000
    );
    expect(usage?.currentCache).toBe(500);
  });

  it('carries the last measured speed', () => {
    const usage = deriveContextUsage(
      [msg({ inputTokenCount: 500, tokenCount: 50, tokensPerSecond: 42 })],
      2000
    );
    expect(usage?.speed).toBe(42);
  });

  it('ignores user messages when measuring', () => {
    const messages = [
      { ...msg({ id: 'u' }), role: 'user' as const, inputTokenCount: 99999 },
      msg({ id: 'a', inputTokenCount: 100, tokenCount: 100 }),
    ];
    const usage = deriveContextUsage(messages, 1000);
    expect(usage).toMatchObject({ used: 200, percent: 20 });
  });
});
