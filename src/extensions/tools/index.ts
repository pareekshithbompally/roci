/** Registers every tool definition and exports the registry singleton. */

import { ToolRegistry } from './registry';
import { searchMeetingsTool } from './definitions/search-meetings.tool';
import { getMeetingTool } from './definitions/get-meeting.tool';
import { listMeetingsTool } from './definitions/list-meetings.tool';
import { getActionItemsTool } from './definitions/get-action-items.tool';
import { manageTodoTool } from './definitions/manage-todo.tool';
import { queryGraphTool } from './definitions/query-graph.tool';
import { searchChatsTool } from './definitions/search-chats.tool';
import { getChatTool } from './definitions/get-chat.tool';
import { listChatsTool } from './definitions/list-chats.tool';

export const toolRegistry = new ToolRegistry();
toolRegistry.register(searchMeetingsTool);
toolRegistry.register(getMeetingTool);
toolRegistry.register(listMeetingsTool);
toolRegistry.register(getActionItemsTool);
toolRegistry.register(manageTodoTool);
toolRegistry.register(queryGraphTool);
toolRegistry.register(searchChatsTool);
toolRegistry.register(getChatTool);
toolRegistry.register(listChatsTool);

export { loadMcpTools } from './mcp-tools';

// Re-export types for convenience
export type { ToolDefinition, ToolContext, ToolCall, ToolResult } from './types';
