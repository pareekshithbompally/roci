import { describe, it, expect } from 'vitest';
import { toolCallView } from '@features/chat/components/tool-call';
import type { ChatToolPart } from '@shared/types';
import { TOOL_RESULT_PREVIEW_CHARS } from '@config/chat.config';

const part = (p: Record<string, unknown>) => ({ type: 'tool-search_meetings', toolCallId: 'c1', ...p }) as unknown as ChatToolPart;
const web = (output: unknown) =>
  toolCallView(part({ type: 'tool-webSearch', toolCallId: 'ws', state: 'output-available', input: {}, output, providerExecuted: true }));

describe('toolCallView', () => {
  it('shows a call under way, with the MCP server it came from', () => {
    expect(toolCallView(part({ type: 'tool-create_issue', state: 'input-streaming', toolMetadata: { source: 'github' } })))
      .toEqual({ type: 'tool_call', toolCallId: 'c1', toolName: 'create_issue', source: 'github', arguments: {}, status: 'calling', result: undefined });
  });

  it('names a dynamic tool by its own name', () => {
    expect(toolCallView(part({ type: 'dynamic-tool', toolName: 'notion:search', state: 'input-available', input: { q: 'x' } })))
      .toMatchObject({ toolName: 'notion:search', arguments: { q: 'x' }, status: 'calling' });
  });

  it("ends a Roci tool with its result and timing", () => {
    const output = { toolCallId: 'c1', content: '2 meetings', isError: false, meta: { toolName: 'search_meetings', executionMs: 42 } };
    expect(toolCallView(part({ state: 'output-available', input: { query: 'budget' }, output })))
      .toMatchObject({ arguments: { query: 'budget' }, status: 'complete', result: { content: '2 meetings', isError: false, executionMs: 42 } });
  });

  it('shows a tool that answered with its own failure as failed', () => {
    const output = { toolCallId: 'c1', content: 'No meeting', isError: true };
    expect(toolCallView(part({ state: 'output-available', input: {}, output }))).toMatchObject({ status: 'error', result: { isError: true } });
  });

  it('ends a thrown tool error with its message', () => {
    expect(toolCallView(part({ state: 'output-error', input: {}, errorText: 'bad input' })))
      .toMatchObject({ status: 'error', result: { content: 'bad input', isError: true } });
  });

  it('keeps a long result to its preview', () => {
    const output = { toolCallId: 'c1', content: 'x'.repeat(TOOL_RESULT_PREVIEW_CHARS + 10), isError: false };
    expect(toolCallView(part({ state: 'output-available', input: {}, output })).result?.content).toHaveLength(TOOL_RESULT_PREVIEW_CHARS);
  });

  it('shows what an OpenAI search did, and its raw output', () => {
    const output = { action: { type: 'search', query: 'ai index' }, sources: [{ type: 'url', url: 'https://a.com/x' }] };
    expect(web(output)).toMatchObject({ arguments: { query: 'ai index' }, status: 'complete', result: { content: JSON.stringify(output), isError: false } });
  });

  it('shows the page an OpenAI search opened or searched in', () => {
    expect(web({ action: { type: 'openPage', url: 'https://a.com/x' } }).arguments).toEqual({ url: 'https://a.com/x' });
    expect(web({ action: { type: 'findInPage', url: 'https://a.com/x', pattern: 'GDP' } }).arguments).toEqual({ url: 'https://a.com/x', pattern: 'GDP' });
  });

  it('leaves out fields the provider sent empty, never the text "null"', () => {
    expect(web({ action: { type: 'openPage', url: null } }).arguments).toEqual({});
    expect(web({ action: { type: 'search', query: null, queries: ['a', 'b'] } }).arguments).toEqual({ queries: ['a', 'b'] });
  });

  it("keeps an Anthropic search's readable title and URL, not its encrypted page content", () => {
    const output = [{ url: 'https://a.com', title: 'A', encryptedContent: 'xyz', pageAge: null }, { url: 'https://b.com', encryptedContent: 'q' }];
    expect(web(output)).toMatchObject({
      arguments: {},
      result: { content: JSON.stringify([{ title: 'A', url: 'https://a.com' }, { url: 'https://b.com' }]), isError: false },
    });
  });
});
