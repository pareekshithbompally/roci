import { describe, it, expect } from 'vitest';
import { toSDKMessages } from '@services/ai/message-converter';
import { formatSentAt } from '@core/ai';
import { extractTokenUsage } from '@services/ai/types';
import type { ModelMessage } from 'ai';
import { chatModelOf } from '@features/chat/utils';
import type { ChatMessage } from '@shared/types';

const TOOLS = ['webSearch', 'searchMeetings'];

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
    const [m] = toSDKMessages([msg([{ type: 'image', mimeType: 'image/png', source: { kind: 'data', base64: bytes } }])], TOOLS);
    expect(m.role).toBe('user');
    const content = (m as { content: Array<{ type: string }> }).content;
    expect(content[1].type).toBe('file');
    expect(content.some((p) => p.type === 'image')).toBe(false);
  });

  it('maps image URL parts to file parts with URL data', () => {
    const [m] = toSDKMessages([
      msg([{ type: 'image', mimeType: 'image/png', source: { kind: 'url', url: 'https://example.com/a.png' } }]),
    ], TOOLS);
    const content = (m as { content: Array<{ type: string; data?: unknown }> }).content;
    expect(content[1].type).toBe('file');
    expect(content[1].data).toBeInstanceOf(URL);
  });

  it('maps audio data parts to file parts', () => {
    const bytes = btoa('fake-audio');
    const [m] = toSDKMessages([msg([{ type: 'audio', mimeType: 'audio/wav', source: { kind: 'data', base64: bytes } }])], TOOLS);
    const content = (m as { content: Array<{ type: string }> }).content;
    expect(content[1].type).toBe('file');
  });
});

describe('conversation history', () => {
  const question: ChatMessage = { id: 'q', role: 'user', text: 'What did we decide?', timestamp: 1, state: 'complete' };
  const asked = { role: 'user', content: [{ type: 'text', text: formatSentAt(1) }, { type: 'text', text: 'What did we decide?' }] };
  const exchange: ModelMessage[] = [
    { role: 'assistant', content: [
      { type: 'reasoning', text: 'Search first.', providerOptions: { anthropic: { signature: 'sig' } } },
      { type: 'tool-call', toolCallId: 'w1', toolName: 'webSearch', input: {}, providerExecuted: true },
      { type: 'tool-result', toolCallId: 'w1', toolName: 'webSearch', output: { type: 'json', value: [{ url: 'https://example.com' }] } },
      { type: 'tool-call', toolCallId: 't1', toolName: 'searchMeetings', input: { query: 'decide' } },
    ] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'searchMeetings', output: { type: 'text', value: 'Ship Friday' } }] },
    { role: 'assistant', content: [{ type: 'text', text: 'We ship Friday.' }] },
  ];
  const reply: ChatMessage = { id: 'r', role: 'model', text: 'We ship Friday.', timestamp: 2, state: 'complete', provider: 'anthropic', model: 'claude', exchange };

  it('sends each reply back exactly as its model made it: thinking, its own search, tool calls and results, the answer', () => {
    expect(toSDKMessages([question, reply], TOOLS)).toEqual([asked, ...exchange]);
  });

  it('prunes calls to a tool this call does not have (turned off since), keeping the rest', () => {
    const sent = toSDKMessages([question, reply], ['searchMeetings']);
    const parts = (sent[1].content as Array<{ type: string; toolName?: string }>);
    expect(parts.some((p) => p.toolName === 'webSearch')).toBe(false);
    expect(parts.some((p) => p.toolName === 'searchMeetings')).toBe(true);
  });

  it('prunes every tool call for a call without tools', () => {
    const sent = toSDKMessages([question, reply], []);
    expect(sent.some((m) => m.role === 'tool')).toBe(false);
    expect(sent.at(-1)).toEqual(exchange[2]);
  });

  it('sends a reply that never finished as its text', () => {
    const stopped: ChatMessage = { ...reply, exchange: undefined, text: 'We ship' };
    expect(toSDKMessages([question, stopped], TOOLS).at(-1)).toEqual({ role: 'assistant', content: 'We ship' });
  });

  it('keeps a question\'s attached meetings with it on every turn', () => {
    const withMeeting: ChatMessage = { ...question, meetingContext: 'Weekly sync: ship Friday' };
    const [sent] = toSDKMessages([withMeeting, reply], TOOLS);
    expect((sent.content as Array<{ text: string }>)[2].text).toContain('## Meetings the user attached\n\nAnswer from these first');
    expect((sent.content as Array<{ text: string }>)[2].text).toContain('Weekly sync: ship Friday');
  });

  it('leads each question with when it was sent, the same on every later turn (so the cached start never changes)', () => {
    const later: ChatMessage = { ...question, id: 'q2', timestamp: 2 };
    const first = toSDKMessages([question, reply], TOOLS);
    const second = toSDKMessages([question, reply, later], TOOLS);
    expect(second.slice(0, first.length)).toEqual(first);
    expect((second.at(-1)!.content as Array<{ text: string }>)[0].text).toBe(formatSentAt(2));
  });

  it('never sends an error or one of Roci\'s notices back as the model\'s words', () => {
    const failed: ChatMessage = { ...reply, id: 'e', exchange: undefined, text: 'Rate limit', isError: true };
    const notice: ChatMessage = { id: 'n', role: 'model', text: 'Please select a model', timestamp: 3, state: 'complete' };
    expect(toSDKMessages([question, failed, notice], TOOLS)).toEqual([asked]);
  });

  it('a failed first reply does not lock the chat; the first real answer does', () => {
    const failed: ChatMessage = { ...reply, id: 'e', provider: 'openai', model: 'gpt-x', isError: true };
    expect(chatModelOf({ id: 's', title: 't', lastMessageAt: 0, messages: [question, failed] })).toBeUndefined();
    expect(chatModelOf({ id: 's', title: 't', lastMessageAt: 0, messages: [question, failed, reply] })).toEqual({ provider: 'anthropic', model: 'claude' });
  });

  it('leaves out a reply still being written', () => {
    expect(toSDKMessages([question, { ...reply, state: 'streaming' }], TOOLS)).toEqual([asked]);
  });

  it('locks a chat to its first reply\'s provider and model; none before it answers', () => {
    const session = { id: 's', title: 't', lastMessageAt: 0, messages: [question, reply, { ...reply, id: 'r2', provider: 'gemini', model: 'g' }] };
    expect(chatModelOf(session)).toEqual({ provider: 'anthropic', model: 'claude' });
    expect(chatModelOf({ ...session, messages: [question] })).toBeUndefined();
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
