import { describe, it, expect } from 'vitest';
import { finalStepReason, finalStepGuard } from '@extensions/tool-orchestrator/stepGuard';
import { FINAL_ANSWER_PROMPT } from '@core/ai/prompts';

const MAX = 10;
const call = (toolName: string, input: unknown) => ({ toolName, input });
const step = (...toolCalls: ReturnType<typeof call>[]) => ({ toolCalls });

describe('finalStepReason', () => {
  it('keeps tools on before any step and for distinct calls', () => {
    expect(finalStepReason([], MAX)).toBeNull();
    expect(finalStepReason([step(call('search', { q: 'a' })), step(call('search', { q: 'b' }))], MAX)).toBeNull();
  });

  it('keeps tools on for the same input to different tools', () => {
    expect(finalStepReason([step(call('search', { q: 'a' })), step(call('fetch', { q: 'a' }))], MAX)).toBeNull();
  });

  it('stops on the first repeated call across steps', () => {
    expect(finalStepReason([step(call('search', { q: 'a' })), step(call('search', { q: 'a' }))], MAX)).toBe('repeated-call');
  });

  it('stops on a repeat within one step and ignores key order', () => {
    expect(finalStepReason([step(call('search', { q: 'a', n: 5 }), call('search', { n: 5, q: 'a' }))], MAX)).toBe('repeated-call');
  });

  it('compares nested input in full', () => {
    expect(finalStepReason([step(call('search', { f: { x: 1, y: 2 } })), step(call('search', { f: { y: 2, x: 1 } }))], MAX)).toBe('repeated-call');
    expect(finalStepReason([step(call('search', { f: { x: 1 } })), step(call('search', { f: { x: 2 } }))], MAX)).toBeNull();
  });

  it('turns tools off once the turn has made the maximum tool calls', () => {
    const steps = Array.from({ length: MAX }, (_, i) => step(call('search', { q: String(i) })));
    expect(finalStepReason(steps.slice(0, -1), MAX)).toBeNull();
    expect(finalStepReason(steps, MAX)).toBe('call-limit');
  });

  it('counts every call in a step, not the steps', () => {
    const wide = step(...Array.from({ length: MAX }, (_, i) => call('search', { q: String(i) })));
    expect(finalStepReason([wide], MAX)).toBe('call-limit');
  });
});

describe('finalStepGuard', () => {
  const messages = [{ role: 'user' as const, content: 'question' }];

  it('changes nothing while tools stay on', () => {
    expect(finalStepGuard(MAX)({ steps: [], messages })).toBeUndefined();
  });

  it('turns tools off and appends the final-answer note as a user message', () => {
    const steps = [step(call('search', { q: 'a' })), step(call('search', { q: 'a' }))];
    expect(finalStepGuard(MAX)({ steps, messages })).toEqual({
      toolChoice: 'none',
      messages: [...messages, { role: 'user', content: FINAL_ANSWER_PROMPT }],
    });
  });
});
