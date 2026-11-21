import { describe, it, expect } from 'vitest';
import { jsonSchema, tool } from 'ai';
import type { ToolSet } from 'ai';
import { toModelMessages } from '@services/ai/message-converter';
import { formatSentAt } from '@core/ai';
import { extractTokenUsage } from '@services/ai/types';
import { chatModelOf } from '@features/chat/utils';
import type { ChatMessage, ChatMetadata, ChatPart } from '@shared/types';
import type { ToolResult } from '@extensions/tools/types';

const schema = jsonSchema<Record<string, unknown>>({ type: 'object' });
/** Roci's tools give the model only their text, as the tools bridge does. */
const rociTool = tool({ inputSchema: schema, toModelOutput: ({ output }: { output: ToolResult }) => ({ type: 'text' as const, value: output.content }) });
const TOOLS: ToolSet = { webSearch: tool({ inputSchema: schema }), searchMeetings: rociTool };

const message = (id: string, role: ChatMessage['role'], parts: ChatPart[], metadata: Partial<ChatMetadata> = {}): ChatMessage =>
  ({ id, role, parts, metadata: { createdAt: 1, state: 'complete', ...metadata } });

const question = message('q', 'user', [{ type: 'data-sentAt', data: { at: 1 } }, { type: 'text', text: 'What did we decide?' }]);
const asked = { role: 'user', content: [{ type: 'text', text: formatSentAt(1) }, { type: 'text', text: 'What did we decide?' }] };

/** A reply over two steps: signed thinking, the provider's own web search and Roci's meeting search, then the answer. */
const reply = message('r', 'assistant', [
  { type: 'step-start' },
  { type: 'reasoning', text: 'Search first.', state: 'done', providerMetadata: { anthropic: { signature: 'sig' } } },
  { type: 'tool-webSearch', toolCallId: 'w1', state: 'output-available', input: {}, output: [{ url: 'https://example.com' }], providerExecuted: true },
  { type: 'tool-searchMeetings', toolCallId: 't1', state: 'output-available', input: { query: 'decide' },
    output: { toolCallId: 't1', content: 'Ship Friday', isError: false, meta: { toolName: 'searchMeetings', executionMs: 5 } } },
  { type: 'step-start' },
  { type: 'text', text: 'We ship Friday.', state: 'done' },
], { provider: 'anthropic', model: 'claude' });

describe('conversation history (convertToModelMessages)', () => {
  it('sends each reply back as its model made it: signed thinking, its own search, tool calls and results, the answer', async () => {
    const sent = await toModelMessages([question, reply], TOOLS);
    expect(sent[0]).toEqual(asked);
    expect(sent.slice(1).map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant']);
    const [step] = sent[1].content as Array<{ type: string; providerOptions?: unknown; toolName?: string }>;
    expect(step).toMatchObject({ type: 'reasoning', text: 'Search first.', providerOptions: { anthropic: { signature: 'sig' } } });
    expect(sent[2].content).toEqual([expect.objectContaining({ type: 'tool-result', toolCallId: 't1', output: { type: 'text', value: 'Ship Friday' } })]);
    expect(sent[3].content).toEqual([{ type: 'text', text: 'We ship Friday.' }]);
  });

  it('sends a tool its text only, never the UI meta', async () => {
    const sent = await toModelMessages([question, reply], TOOLS);
    expect(JSON.stringify(sent)).not.toContain('executionMs');
  });

  it('prunes calls to a tool this call does not have (turned off since), keeping the rest', async () => {
    const sent = await toModelMessages([question, reply], { searchMeetings: rociTool });
    const names = sent.flatMap((m) => (typeof m.content === 'string' ? [] : m.content.map((p) => ('toolName' in p ? p.toolName : null))));
    expect(names).not.toContain('webSearch');
    expect(names).toContain('searchMeetings');
  });

  it('leaves out a stopped reply\'s tool call that never answered, keeping what it said', async () => {
    const stopped = message('s', 'assistant', [
      { type: 'text', text: 'Looking', state: 'done' },
      { type: 'tool-searchMeetings', toolCallId: 't9', state: 'input-available', input: { query: 'x' } },
    ], { provider: 'anthropic', model: 'claude' });
    const sent = await toModelMessages([question, stopped], TOOLS);
    expect(sent.at(-1)).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Looking' }] });
  });

  it('keeps a question\'s attached meetings with it on every turn', async () => {
    const withMeeting = { ...question, parts: [...question.parts, { type: 'data-meetings' as const, data: { context: 'Weekly sync: ship Friday' } }] };
    const [sent] = await toModelMessages([withMeeting, reply], TOOLS);
    const text = (sent.content as Array<{ text: string }>)[2].text;
    expect(text).toContain('## Meetings the user attached\n\nAnswer from these first');
    expect(text).toContain('Weekly sync: ship Friday');
  });

  it('leads each question with when it was sent, the same on every later turn (so the cached start never changes)', async () => {
    const later = message('q2', 'user', [{ type: 'data-sentAt', data: { at: 2 } }, { type: 'text', text: 'And then?' }]);
    const first = await toModelMessages([question, reply], TOOLS);
    const second = await toModelMessages([question, reply, later], TOOLS);
    expect(second.slice(0, first.length)).toEqual(first);
    expect((second.at(-1)!.content as Array<{ text: string }>)[0].text).toBe(formatSentAt(2));
  });

  it('sends an attachment as a file part', async () => {
    const attached = { ...question, parts: [...question.parts, { type: 'file' as const, mediaType: 'image/png', url: `data:image/png;base64,${btoa('png')}`, filename: 'a.png' }] };
    const [sent] = await toModelMessages([attached], TOOLS);
    expect((sent.content as Array<{ type: string }>).map((p) => p.type)).toEqual(['text', 'text', 'file']);
  });

  it('never sends an error or one of Roci\'s notices back as the model\'s words', async () => {
    const failed = message('e', 'assistant', [{ type: 'text', text: 'Rate limit' }], { provider: 'anthropic', model: 'claude', isError: true });
    const notice = message('n', 'assistant', [{ type: 'text', text: 'Please select a model' }]);
    expect(await toModelMessages([question, failed, notice], TOOLS)).toEqual([asked]);
  });

  it('leaves out a reply still being written', async () => {
    expect(await toModelMessages([question, { ...reply, metadata: { ...reply.metadata, state: 'streaming' } }], TOOLS)).toEqual([asked]);
  });
});

describe('model lock', () => {
  it('a failed first reply does not lock the chat; the first real answer does', () => {
    const failed = message('e', 'assistant', [], { provider: 'openai', model: 'gpt-x', isError: true });
    expect(chatModelOf({ id: 's', title: 't', lastMessageAt: 0, messages: [question, failed] })).toBeUndefined();
    expect(chatModelOf({ id: 's', title: 't', lastMessageAt: 0, messages: [question, failed, reply] })).toEqual({ provider: 'anthropic', model: 'claude' });
  });

  it('locks a chat to its first reply\'s provider and model; none before it answers', () => {
    const second = message('r2', 'assistant', [], { provider: 'gemini', model: 'g' });
    const session = { id: 's', title: 't', lastMessageAt: 0, messages: [question, reply, second] };
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
