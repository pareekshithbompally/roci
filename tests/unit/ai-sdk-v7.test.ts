import { describe, it, expect } from 'vitest';
import { jsonSchema, tool } from 'ai';
import type { ToolSet } from 'ai';
import { toModelMessages } from '@services/ai/message-converter';
import { attachedFileText, formatSentAt, unreadableFileText } from '@core/ai';
import type { Modality } from '@config/modelSpine.config';
import { ATTACHMENT_TYPES } from '@config/chat.config';
import { extractTokenUsage } from '@services/ai/types';
import { chatModelOf } from '@features/chat/utils';
import type { ChatMessage, ChatMetadata, ChatPart } from '@shared/types';
import type { ToolResult } from '@extensions/tools/types';

const schema = jsonSchema<Record<string, unknown>>({ type: 'object' });
/** Roci's tools give the model only their text, as the tools bridge does. */
const rociTool = tool({ inputSchema: schema, toModelOutput: ({ output }: { output: ToolResult }) => ({ type: 'text' as const, value: output.content }) });
/** A text-only model's inputs. */
const TEXT_ONLY = ['text'] as const;
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
    const sent = await toModelMessages([question, reply], TOOLS, TEXT_ONLY);
    expect(sent[0]).toEqual(asked);
    expect(sent.slice(1).map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant']);
    const [step] = sent[1].content as Array<{ type: string; providerOptions?: unknown; toolName?: string }>;
    expect(step).toMatchObject({ type: 'reasoning', text: 'Search first.', providerOptions: { anthropic: { signature: 'sig' } } });
    expect(sent[2].content).toEqual([expect.objectContaining({ type: 'tool-result', toolCallId: 't1', output: { type: 'text', value: 'Ship Friday' } })]);
    expect(sent[3].content).toEqual([{ type: 'text', text: 'We ship Friday.' }]);
  });

  it('sends a tool its text only, never the UI meta', async () => {
    const sent = await toModelMessages([question, reply], TOOLS, TEXT_ONLY);
    expect(JSON.stringify(sent)).not.toContain('executionMs');
  });

  it('prunes calls to a tool this call does not have (turned off since), keeping the rest', async () => {
    const sent = await toModelMessages([question, reply], { searchMeetings: rociTool }, TEXT_ONLY);
    const names = sent.flatMap((m) => (typeof m.content === 'string' ? [] : m.content.map((p) => ('toolName' in p ? p.toolName : null))));
    expect(names).not.toContain('webSearch');
    expect(names).toContain('searchMeetings');
  });

  it('leaves out a stopped reply\'s tool call that never answered, keeping what it said', async () => {
    const stopped = message('s', 'assistant', [
      { type: 'text', text: 'Looking', state: 'done' },
      { type: 'tool-searchMeetings', toolCallId: 't9', state: 'input-available', input: { query: 'x' } },
    ], { provider: 'anthropic', model: 'claude' });
    const sent = await toModelMessages([question, stopped], TOOLS, TEXT_ONLY);
    expect(sent.at(-1)).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Looking' }] });
  });

  it('keeps a question\'s attached meetings with it on every turn', async () => {
    const withMeeting = { ...question, parts: [...question.parts, { type: 'data-meetings' as const, data: { context: 'Weekly sync: ship Friday' } }] };
    const [sent] = await toModelMessages([withMeeting, reply], TOOLS, TEXT_ONLY);
    const text = (sent.content as Array<{ text: string }>)[2].text;
    expect(text).toContain('## Meetings the user attached\n\nAnswer from these first');
    expect(text).toContain('Weekly sync: ship Friday');
  });

  it('leads each question with when it was sent, the same on every later turn (so the cached start never changes)', async () => {
    const later = message('q2', 'user', [{ type: 'data-sentAt', data: { at: 2 } }, { type: 'text', text: 'And then?' }]);
    const first = await toModelMessages([question, reply], TOOLS, TEXT_ONLY);
    const second = await toModelMessages([question, reply, later], TOOLS, TEXT_ONLY);
    expect(second.slice(0, first.length)).toEqual(first);
    expect((second.at(-1)!.content as Array<{ text: string }>)[0].text).toBe(formatSentAt(2));
  });

  describe('attached files, as the model can read them', () => {
    const file = (mediaType: string, filename: string, body: string) =>
      ({ type: 'file' as const, mediaType, url: `data:${mediaType};base64,${btoa(body)}`, filename });
    const sentWith = async (part: ReturnType<typeof file>, input: readonly Modality[]) => {
      const [sent] = await toModelMessages([{ ...question, parts: [...question.parts, part] }], TOOLS, input);
      return (sent.content as Array<{ type: string; text?: string }>).at(-1);
    };

    it('sends a file the model reads as itself', async () => {
      expect(await sentWith(file('image/png', 'a.png', 'png'), ['text', 'image'])).toMatchObject({ type: 'file' });
      expect(await sentWith(file('application/pdf', 'q3.pdf', '%PDF'), ['text', 'pdf'])).toMatchObject({ type: 'file' });
    });

    it('sends a text file as its contents, to any model, even when the system gave it no type', async () => {
      expect(await sentWith(file('application/octet-stream', 'notes.md', '# Plan\nShip it'), TEXT_ONLY))
        .toEqual({ type: 'text', text: attachedFileText('notes.md', '# Plan\nShip it') });
      expect(await sentWith(file('text/csv', 'q3.csv', 'a,b\n1,2'), TEXT_ONLY)).toMatchObject({ text: attachedFileText('q3.csv', 'a,b\n1,2') });
    });

    it('sends a long text file cut to the limit, saying where it was cut', async () => {
      const long = 'x'.repeat(ATTACHMENT_TYPES.text.maxChars + 10);
      const sent = await sentWith(file('text/plain', 'log.txt', long), TEXT_ONLY);
      expect(sent?.text).toBe(attachedFileText('log.txt', long.slice(0, ATTACHMENT_TYPES.text.maxChars), long.length));
      expect(sent?.text).toContain('Cut here');
    });

    it('names a file the model can\'t read instead of sending it, so a chat holding one keeps working', async () => {
      expect(await sentWith(file('application/pdf', 'q3.pdf', '%PDF'), ['text', 'image'])).toEqual({ type: 'text', text: unreadableFileText('q3.pdf') });
      expect(await sentWith(file('image/png', 'a.png', 'png'), TEXT_ONLY)).toEqual({ type: 'text', text: unreadableFileText('a.png') });
      const word = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      expect(await sentWith(file(word, 'brief.docx', 'PK'), ['text', 'image', 'pdf'])).toEqual({ type: 'text', text: unreadableFileText('brief.docx') });
    });
  });

  it('never sends an error or one of Roci\'s notices back as the model\'s words', async () => {
    const failed = message('e', 'assistant', [{ type: 'text', text: 'Rate limit' }], { provider: 'anthropic', model: 'claude', isError: true });
    const notice = message('n', 'assistant', [{ type: 'text', text: 'Please select a model' }]);
    expect(await toModelMessages([question, failed, notice], TOOLS, TEXT_ONLY)).toEqual([asked]);
  });

  it('leaves out a reply still being written', async () => {
    expect(await toModelMessages([question, { ...reply, metadata: { ...reply.metadata, state: 'streaming' } }], TOOLS, TEXT_ONLY)).toEqual([asked]);
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
