import { describe, it, expect } from 'vitest';
import { toSDKMessages } from '@services/ai/message-converter';
import { extractTokenUsage } from '@services/ai/types';
import type { ModelMessage } from 'ai';
import type { ChatMessage } from '@shared/types';

const TARGET = { tools: true };

const msg = (parts: ChatMessage['parts']): ChatMessage => ({
  id: 'm1',
  role: 'user',
  text: '',
  parts,
  timestamp: Date.now(),
  state: 'complete',
});

describe('AI SDK v7 message shapes', () => {
  it('maps image data parts to canonical file parts (ImagePart is deprecated)', () => {
    const bytes = btoa('fake-png-bytes');
    const [m] = toSDKMessages([msg([{ type: 'image', mimeType: 'image/png', source: { kind: 'data', base64: bytes } }])], TARGET);
    expect(m.role).toBe('user');
    const content = (m as { content: Array<{ type: string }> }).content;
    expect(content[0].type).toBe('file');
    expect(content.some((p) => p.type === 'image')).toBe(false);
  });

  it('maps image URL parts to file parts with URL data', () => {
    const [m] = toSDKMessages([
      msg([{ type: 'image', mimeType: 'image/png', source: { kind: 'url', url: 'https://example.com/a.png' } }]),
    ], TARGET);
    const content = (m as { content: Array<{ type: string; data?: unknown }> }).content;
    expect(content[0].type).toBe('file');
    expect(content[0].data).toBeInstanceOf(URL);
  });

  it('maps audio data parts to file parts', () => {
    const bytes = btoa('fake-audio');
    const [m] = toSDKMessages([msg([{ type: 'audio', mimeType: 'audio/wav', source: { kind: 'data', base64: bytes } }])], TARGET);
    const content = (m as { content: Array<{ type: string }> }).content;
    expect(content[0].type).toBe('file');
  });
});

describe('conversation history', () => {
  const question: ChatMessage = { id: 'q', role: 'user', text: 'What did we decide?', timestamp: 1, state: 'complete' };
  const asked = { role: 'user', content: [{ type: 'text', text: 'What did we decide?' }] };
  const exchange: ModelMessage[] = [
    { role: 'assistant', content: [
      { type: 'reasoning', text: 'Search first.', providerOptions: { anthropic: { signature: 'sig' } } },
      { type: 'tool-call', toolCallId: 'w1', toolName: 'webSearch', input: {}, providerExecuted: true },
      { type: 'tool-result', toolCallId: 'w1', toolName: 'webSearch', output: { type: 'json', value: [{ url: 'https://example.com', encryptedContent: 'x' }] } },
      { type: 'tool-call', toolCallId: 't1', toolName: 'searchMeetings', input: { query: 'decide' } },
    ] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'searchMeetings', output: { type: 'text', value: 'Ship Friday' } }] },
    { role: 'assistant', content: [{ type: 'text', text: 'We ship Friday.' }] },
  ];
  const reply: ChatMessage = { id: 'r', role: 'model', text: 'We ship Friday.', timestamp: 2, state: 'complete', provider: 'anthropic', exchange };

  it('sends every model the reply as any model reads it: Roci\'s tool calls, their results, then the answer — no provider-run search or thinking', () => {
    expect(toSDKMessages([question, reply], TARGET)).toEqual([
      asked,
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'searchMeetings', input: { query: 'decide' } }] },
      exchange[1],
      exchange[2],
    ]);
  });

  it('gives a call without tools the tool results as text, inside the reply', () => {
    expect(toSDKMessages([question, reply], { tools: false })).toEqual([
      asked,
      { role: 'assistant', content: 'searchMeetings returned:\nShip Friday\n\nWe ship Friday.' },
    ]);
  });

  it('sends a reply that never finished as its text', () => {
    const stopped: ChatMessage = { ...reply, exchange: undefined, text: 'We ship' };
    expect(toSDKMessages([question, stopped], TARGET).at(-1)).toEqual({ role: 'assistant', content: 'We ship' });
  });

  it('keeps a question\'s attached meetings with it on every turn', () => {
    const withMeeting: ChatMessage = { ...question, meetingContext: 'Weekly sync: ship Friday' };
    const [sent] = toSDKMessages([withMeeting, reply], TARGET);
    expect((sent.content as Array<{ text: string }>)[1].text).toContain('## Meetings the user attached\n\nAnswer from these first');
    expect((sent.content as Array<{ text: string }>)[1].text).toContain('Weekly sync: ship Friday');
  });

  it('leaves out a reply still being written', () => {
    expect(toSDKMessages([question, { ...reply, state: 'streaming' }], TARGET)).toEqual([asked]);
  });
});

describe('extractTokenUsage', () => {
  it('reads cache and reasoning tokens from v7 usage details', () => {
    expect(
      extractTokenUsage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        inputTokenDetails: { cacheReadTokens: 3, cacheWriteTokens: 4 },
        outputTokenDetails: { reasoningTokens: 2 },
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
      reasoningTokens: 2,
    });
  });
});
