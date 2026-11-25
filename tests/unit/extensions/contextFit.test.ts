import { describe, it, expect, vi } from 'vitest';
import type { ModelMessage } from 'ai';
import { fitMessages, messageRoom } from '@extensions/tool-orchestrator/contextFit';
import { CHAT_CONTEXT_CONFIG } from '@config/chat.config';
import { AiError } from '@services/ai/errors';

vi.spyOn(console, 'info').mockImplementation(() => undefined);

const user = (text: string): ModelMessage => ({ role: 'user', content: [{ type: 'text', text }] });
const thought = (text: string, answer: string): ModelMessage => ({ role: 'assistant', content: [{ type: 'reasoning', text }, { type: 'text', text: answer }] });
const call = (id: string): ModelMessage => ({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName: 'find', input: { q: id } }] });
const result = (id: string, text: string): ModelMessage => ({
  role: 'tool', content: [{ type: 'tool-result', toolCallId: id, toolName: 'find', output: { type: 'text', value: text } }],
});
const answer = (text: string): ModelMessage => ({ role: 'assistant', content: [{ type: 'text', text }] });
const big = (n: number) => 'x'.repeat(n);

/** An old turn heavy with a tool result and thinking, then the latest question. */
const conversation = (): ModelMessage[] => [
  user('first'), call('c1'), result('c1', big(3_000)), thought(big(1_000), 'old answer'),
  user('second'), answer('second answer'),
  user('latest'),
];

describe('messageRoom', () => {
  it('is the share of the window past which history is pruned, less what every request carries; none when unknown', () => {
    expect(messageRoom(10_000, 1_000)).toBe(10_000 * CHAT_CONTEXT_CONFIG.pruneAbove - 1_000);
    expect(messageRoom(null, 1_000)).toBeNull();
  });
});

describe('fitMessages', () => {
  it('leaves a conversation that fits as it is (the same array), and any when the window is unknown', () => {
    const messages = conversation();
    expect(fitMessages(messages, 100_000)).toBe(messages);
    expect(fitMessages(messages, null)).toBe(messages);
  });

  it('past the room, prunes old tool calls and thinking first, keeping every turn and the latest question', () => {
    const fitted = fitMessages(conversation(), 700);
    expect(fitted.at(-1)).toEqual(user('latest'));
    expect(fitted[0]).toEqual(user('first'));
    expect(JSON.stringify(fitted)).not.toContain('tool-call');
    expect(JSON.stringify(fitted)).not.toContain('reasoning');
    expect(JSON.stringify(fitted)).toContain('old answer');
  });

  it('keeps the tool calls of the last messages whole', () => {
    const messages = [user('first'), answer(big(3_000)), user('latest'), call('c2'), result('c2', 'found it')];
    const fitted = fitMessages(messages, 200);
    expect(fitted).toEqual([user('latest'), call('c2'), result('c2', 'found it')]);
  });

  it('when pruning is not enough, leaves out the oldest whole turns, never the latest question', () => {
    const messages = [user(big(3_000)), answer('a1'), user('second'), answer('a2'), user('latest')];
    expect(fitMessages(messages, 100)).toEqual([user('second'), answer('a2'), user('latest')]);
  });

  it('says plainly when the latest question alone does not fit', () => {
    const messages = [user('first'), answer('a1'), user(big(3_000))];
    expect(() => fitMessages(messages, 100)).toThrow(AiError);
    expect(() => fitMessages(messages, 100)).toThrow(/don’t fit the model’s context/);
  });

  it('counts an attached file by what it says, not its bytes', () => {
    const file: ModelMessage = { role: 'user', content: [{ type: 'text', text: 'see this' }, { type: 'file', data: `data:image/png;base64,${big(100_000)}`, mediaType: 'image/png' }] };
    const messages = [file];
    expect(fitMessages(messages, 1_000)).toBe(messages);
  });
});
