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
  const ctx = (prompt: number, reply: number, cached = 0) => ({ context: { prompt, reply, cached } });

  it('returns null when the context total is unknown', () => {
    const messages = [msg(ctx(100, 50))];
    expect(deriveContextUsage(messages, null)).toBeNull();
    expect(deriveContextUsage(messages, 0)).toBeNull();
  });

  it('returns null until a reply has measured its context', () => {
    expect(deriveContextUsage([msg()], 1000)).toBeNull();
    expect(deriveContextUsage([], 1000)).toBeNull();
  });

  it('is what the window holds after the last reply: its last call\'s prompt plus the reply, with the room left', () => {
    const messages = [msg({ id: 'a', ...ctx(200, 100) }), msg({ id: 'b', ...ctx(800, 200, 300) })];
    expect(deriveContextUsage(messages, 2000)).toEqual({
      total: 2000, used: 1000, left: 1000, percent: 50, level: 'ok', prompt: 800, cached: 300, reply: 200,
    });
  });

  it('never reads over 100% or below no room', () => {
    expect(deriveContextUsage([msg(ctx(1900, 300))], 2000)).toMatchObject({ percent: 100, left: 0, level: 'critical' });
  });

  it('clamps cached tokens to the prompt', () => {
    expect(deriveContextUsage([msg(ctx(500, 50, 900))], 2000)?.cached).toBe(500);
  });

  it('ignores user messages when measuring', () => {
    const messages = [{ ...msg({ id: 'u', ...ctx(99_999, 0) }), role: 'user' as const }, msg({ id: 'a', ...ctx(100, 100) })];
    expect(deriveContextUsage(messages, 1000)).toMatchObject({ used: 200, percent: 20 });
  });
});
