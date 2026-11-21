import { describe, it, expect } from 'vitest';
import type { ToolCallView } from '@features/chat/components/tool-call';
import { toolCallTitle, formatExecutionMs } from '@features/chat/components/tool-call';

function part(overrides: Partial<ToolCallView>): ToolCallView {
  return {
    type: 'tool_call',
    toolCallId: 'call-1',
    toolName: 'find',
    arguments: { in: 'meetings' },
    status: 'complete',
    ...overrides,
  };
}

describe('toolCallTitle — built-in tools', () => {
  const cases: Array<[string, Record<string, unknown>, string, string]> = [
    ['find', { in: 'meetings', query: 'pricing' }, 'Searching meetings for “pricing”…', 'Searched meetings for “pricing”'],
    ['read', { meeting_id: 'm-42' }, 'Retrieving meeting “m-42”…', 'Retrieved meeting “m-42”'],
    ['find', { in: 'meetings', limit: 10 }, 'Listing meetings (up to 10 meetings)…', 'Listed meetings (up to 10 meetings)'],
    ['find', { in: 'todos' }, 'Reading to-dos…', 'Read to-dos'],
    ['find', { in: 'chats', query: 'roadmap' }, 'Searching chats for “roadmap”…', 'Searched chats for “roadmap”'],
    ['read', { chat_id: 's1' }, 'Retrieving chat…', 'Retrieved chat'],
    ['find', { in: 'chats', limit: 5 }, 'Listing chats (up to 5 chats)…', 'Listed chats (up to 5 chats)'],
    ['suggest_todo', { action: 'add', text: 'Send deck' }, 'Drafting to-do “Send deck”…', 'Drafted to-do “Send deck”'],
    ['suggest_todo', { action: 'update', todo_id: 't1', done: true }, 'Drafting to-do change…', 'Drafted to-do change'],
    ['suggest_todo', { action: 'delete', todo_id: 't1' }, 'Drafting to-do removal…', 'Drafted to-do removal'],
    ['webSearch', { query: 'tauri 2' }, 'Searching the web for “tauri 2”…', 'Searched the web for “tauri 2”'],
    ['webSearch', { url: 'https://www.nytimes.com/a' }, 'Searching the web on nytimes.com…', 'Searched the web on nytimes.com'],
    ['googleSearch', {}, 'Searching the web…', 'Searched the web'],
    ['webSearchPreview', {}, 'Searching the web…', 'Searched the web'],
    ['browserSearch', {}, 'Searching the web…', 'Searched the web'],
  ];

  it.each(cases)('%s', (toolName, args, calling, complete) => {
    expect(toolCallTitle(part({ toolName, arguments: args, status: 'calling' }))).toBe(calling);
    expect(toolCallTitle(part({ toolName, arguments: args, status: 'complete' }))).toBe(complete);
  });

  it('uses the meeting title from the read result over the id', () => {
    const p = part({
      toolName: 'read',
      arguments: { meeting_id: 'm-42', parts: ['summary'] },
      result: { content: '## Meeting: Weekly sync\n\n### Summary\nShipped.', isError: false },
    });
    expect(toolCallTitle(p)).toBe('Retrieved meeting “Weekly sync”');
  });

  it('truncates long query snippets', () => {
    const title = toolCallTitle(part({ arguments: { in: 'meetings', query: 'x'.repeat(200) } }));
    expect(title.length).toBeLessThan(120);
    expect(title).toMatch(/\.\.\.”$/);
  });

  it('ignores blank and non-string query arguments', () => {
    expect(toolCallTitle(part({ arguments: { in: 'meetings', query: '  ' } }))).toBe('Searched meetings');
    expect(toolCallTitle(part({ arguments: { in: 'meetings', query: 5 } }))).toBe('Searched meetings');
  });
});

describe('toolCallTitle — MCP, unknown, error', () => {
  it('MCP tools read "server · tool"', () => {
    expect(toolCallTitle(part({ toolName: 'create_issue', source: 'github' }))).toBe('github · create issue');
    expect(toolCallTitle(part({ toolName: 'create_issue', source: 'github', status: 'calling' }))).toBe('github · create issue…');
  });

  it('MCP tools named like a built-in still read as MCP', () => {
    expect(toolCallTitle(part({ toolName: 'search_meetings', source: 'notion', arguments: { query: 'q' } })))
      .toBe('notion · search meetings');
  });

  it('unknown built-in tools fall back to Running/Used', () => {
    expect(toolCallTitle(part({ toolName: 'do_thing', status: 'calling' }))).toBe('Running do thing…');
    expect(toolCallTitle(part({ toolName: 'do_thing' }))).toBe('Used do thing');
  });

  it('titles a legacy query_graph call with the generic fallback', () => {
    expect(toolCallTitle(part({ toolName: 'query_graph', arguments: { query: 'Alice' }, status: 'complete' }))).toBe('Used query graph');
  });

  it('error state reads "<tool> failed"', () => {
    expect(toolCallTitle(part({ status: 'error', arguments: { in: 'meetings', query: 'pricing' } }))).toBe('Searching meetings failed');
    expect(toolCallTitle(part({ toolName: 'create_issue', source: 'github', status: 'error' }))).toBe('github · create issue failed');
  });
});

describe('formatExecutionMs', () => {
  it('formats ms and seconds', () => {
    expect(formatExecutionMs(850.4)).toBe('850ms');
    expect(formatExecutionMs(1234)).toBe('1.2s');
  });
});
