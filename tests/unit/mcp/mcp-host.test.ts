import { describe, it, expect, vi, beforeEach } from 'vitest';

const host = vi.hoisted(() => ({
  handler: null as null | ((call: { id: number; name: string; arguments: Record<string, unknown> }) => void),
  publishTools: vi.fn(),
  reply: vi.fn(),
}));
vi.mock('@services/mcpHost.service', () => ({
  mcpHostService: {
    publishTools: host.publishTools,
    reply: host.reply,
    onCall: vi.fn(async (handler: typeof host.handler) => { host.handler = handler; return () => {}; }),
  },
}));
vi.mock('@shared/query/queryClient', () => ({
  queryClient: { fetchQuery: vi.fn(async () => []), invalidateQueries: vi.fn() },
}));
const todos = vi.hoisted(() => ({ commit: vi.fn(), propose: vi.fn() }));
vi.mock('@features/chat', () => ({
  todoProposalStore: { propose: todos.propose },
  commitTodoProposal: todos.commit,
}));

import { serveTools, toWireTool } from '@extensions/tools/mcp-host';
import { suggestTodoTool } from '@extensions/tools/definitions/suggest-todo.tool';
import { toolRegistry } from '@extensions/tools';

describe('Roci MCP host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    host.handler = null;
  });

  it('publishes every registry tool, marking only writers destructive', async () => {
    await serveTools();
    const [tools] = host.publishTools.mock.calls[0];
    expect(tools.map((t: { name: string }) => t.name)).toEqual(toolRegistry.getToolNames());
    expect(toWireTool(suggestTodoTool).annotations).toEqual({ readOnlyHint: false, destructiveHint: true, openWorldHint: false });
    const find = tools.find((t: { name: string }) => t.name === 'find');
    expect(find.annotations.readOnlyHint).toBe(true);
  });

  it('saves an agent\'s to-do at once, with no meeting, instead of proposing it in chat', async () => {
    await serveTools();
    host.handler?.({ id: 7, name: 'suggest_todo', arguments: { action: 'add', text: 'Ship it', meeting_id: null } });
    await vi.waitFor(() => expect(host.reply).toHaveBeenCalled());
    expect(todos.commit).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', text: 'Ship it', meetingId: null }));
    expect(todos.propose).not.toHaveBeenCalled();
    expect(host.reply).toHaveBeenCalledWith(7, expect.stringContaining('Done: create to-do "Ship it"'), false);
  });

  it('answers a malformed call with what to fix, and runs nothing', async () => {
    await serveTools();
    host.handler?.({ id: 9, name: 'suggest_todo', arguments: { action: 'add', due_date: 'next friday' } });
    await vi.waitFor(() => expect(host.reply).toHaveBeenCalled());
    const [, text, isError] = host.reply.mock.calls[0];
    expect(isError).toBe(true);
    expect(text).toContain('Invalid arguments for suggest_todo');
    expect(text).toContain('YYYY-MM-DD');
    expect(todos.commit).not.toHaveBeenCalled();
  });

  it('answers an unknown tool with an error the agent can read', async () => {
    await serveTools();
    host.handler?.({ id: 8, name: 'nope', arguments: {} });
    await vi.waitFor(() => expect(host.reply).toHaveBeenCalledWith(8, 'Unknown tool "nope"', true));
  });
});
