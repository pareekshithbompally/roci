import { describe, it, expect } from 'vitest';
import type { TextStreamPart, ToolSet } from 'ai';
import { toolActivityOf } from '@extensions/tool-orchestrator/toolActivity';

type Part = TextStreamPart<ToolSet>;
const part = (p: Record<string, unknown>) => p as unknown as Part;
const NO_SOURCES = new Map<string, string>();

describe('toolActivityOf', () => {
  it('starts a row when a tool begins, with its MCP server', () => {
    const sources = new Map([['create_issue', 'github']]);
    expect(toolActivityOf(part({ type: 'tool-input-start', id: 'c1', toolName: 'create_issue' }), sources))
      .toEqual({ toolCallId: 'c1', toolName: 'create_issue', source: 'github', phase: 'start' });
  });

  it('fills in the arguments when the call is complete', () => {
    expect(toolActivityOf(part({ type: 'tool-call', toolCallId: 'c1', toolName: 'search_meetings', input: { query: 'budget' } }), NO_SOURCES))
      .toEqual({ toolCallId: 'c1', toolName: 'search_meetings', phase: 'input', arguments: { query: 'budget' } });
  });

  it("ends a Kasset tool with runTool's result, timing and citations", () => {
    const citations = [{ meetingId: 'm1', score: 0.9 }];
    const output = { toolCallId: 'c1', content: '2 meetings', isError: false, meta: { toolName: 'search_meetings', executionMs: 42, citations } };
    expect(toolActivityOf(part({ type: 'tool-result', toolCallId: 'c1', toolName: 'search_meetings', output }), NO_SOURCES))
      .toEqual({ toolCallId: 'c1', toolName: 'search_meetings', phase: 'end', result: { content: '2 meetings', isError: false, executionMs: 42, citations } });
  });

  it('reads the query and results of an OpenAI web search', () => {
    const output = { action: { type: 'search', query: 'ai index' }, sources: [{ type: 'url', url: 'https://a.com/x' }] };
    expect(toolActivityOf(part({ type: 'tool-result', toolCallId: 'ws1', toolName: 'webSearch', output, providerExecuted: true }), NO_SOURCES))
      .toEqual({ toolCallId: 'ws1', toolName: 'webSearch', phase: 'end', arguments: { query: 'ai index' }, result: { content: 'https://a.com/x', isError: false } });
  });

  it('reads the page an OpenAI web search opened', () => {
    const output = { action: { type: 'openPage', url: 'https://a.com/x' } };
    const activity = toolActivityOf(part({ type: 'tool-result', toolCallId: 'ws2', toolName: 'webSearch', output, providerExecuted: true }), NO_SOURCES);
    expect(activity).toMatchObject({ phase: 'end', arguments: { url: 'https://a.com/x' }, result: { content: 'https://a.com/x' } });
  });

  it("lists an Anthropic web search's results by title and URL", () => {
    const output = [{ url: 'https://a.com', title: 'A' }, { url: 'https://b.com' }];
    const activity = toolActivityOf(part({ type: 'tool-result', toolCallId: 'ws3', toolName: 'webSearch', output, providerExecuted: true }), NO_SOURCES);
    expect(activity).toMatchObject({ phase: 'end', result: { content: 'A · https://a.com\nhttps://b.com', isError: false } });
    expect(activity).not.toHaveProperty('arguments');
  });

  it("ends a failed built-in search with the provider's error code", () => {
    const error = { type: 'web_search_tool_result_error', errorCode: 'max_uses_exceeded' };
    expect(toolActivityOf(part({ type: 'tool-error', toolCallId: 'ws4', toolName: 'webSearch', error, providerExecuted: true }), NO_SOURCES))
      .toMatchObject({ phase: 'end', result: { content: 'Failed (max_uses_exceeded)', isError: true } });
  });

  it('ends a thrown tool error with its message', () => {
    expect(toolActivityOf(part({ type: 'tool-error', toolCallId: 'c2', toolName: 'get_meeting', error: new Error('bad input') }), NO_SOURCES))
      .toMatchObject({ phase: 'end', result: { content: 'bad input', isError: true } });
  });

  it('ignores events that are not about a tool', () => {
    expect(toolActivityOf(part({ type: 'text-delta', id: 't', text: 'hi' }), NO_SOURCES)).toBeNull();
  });
});
