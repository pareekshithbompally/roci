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
  GENERAL_MEETING_ID: '_general',
  GENERAL_MEETING_TITLE: 'General',
}));

import { serveTools, toWireTool } from '@extensions/tools/mcp-host';
import { manageTodoTool } from '@extensions/tools/definitions/manage-todo.tool';
import { toolRegistry } from '@extensions/tools';

describe('Kasset MCP host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    host.handler = null;
  });

  it('publishes every registry tool, marking only writers destructive', async () => {
    await serveTools();
    const [tools] = host.publishTools.mock.calls[0];
    expect(tools.map((t: { name: string }) => t.name)).toEqual(toolRegistry.getToolNames());
    expect(toWireTool(manageTodoTool).annotations).toEqual({ readOnlyHint: false, destructiveHint: true, openWorldHint: false });
    const listMeetings = tools.find((t: { name: string }) => t.name === 'list_meetings');
    expect(listMeetings.annotations.readOnlyHint).toBe(true);
  });

  it('saves an agent\'s todo at once instead of proposing it in chat', async () => {
    await serveTools();
    host.handler?.({ id: 7, name: 'manage_todo', arguments: { action: 'create', meeting_id: '_general', text: 'Ship it' } });
    await vi.waitFor(() => expect(host.reply).toHaveBeenCalled());
    expect(todos.commit).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', text: 'Ship it' }));
    expect(todos.propose).not.toHaveBeenCalled();
    expect(host.reply).toHaveBeenCalledWith(7, expect.stringContaining('Done: Create todo "Ship it"'), false);
  });

  it('answers an unknown tool with an error the agent can read', async () => {
    await serveTools();
    host.handler?.({ id: 8, name: 'nope', arguments: {} });
    await vi.waitFor(() => expect(host.reply).toHaveBeenCalledWith(8, 'Unknown tool "nope"', true));
  });
});
