/** Registers every tool definition and exports the registry singleton. */

import { ToolRegistry } from './registry';
import { searchMeetingsTool } from './definitions/search-meetings.tool';
import { getMeetingTool } from './definitions/get-meeting.tool';
import { listMeetingsTool } from './definitions/list-meetings.tool';
import { listTodosTool } from './definitions/list-todos.tool';
import { createTodoTool } from './definitions/create-todo.tool';
import { updateTodoTool } from './definitions/update-todo.tool';
import { deleteTodoTool } from './definitions/delete-todo.tool';
import { searchChatsTool } from './definitions/search-chats.tool';
import { getChatTool } from './definitions/get-chat.tool';
import { listChatsTool } from './definitions/list-chats.tool';

export const toolRegistry = new ToolRegistry();
toolRegistry.register(searchMeetingsTool);
toolRegistry.register(getMeetingTool);
toolRegistry.register(listMeetingsTool);
toolRegistry.register(listTodosTool);
toolRegistry.register(createTodoTool);
toolRegistry.register(updateTodoTool);
toolRegistry.register(deleteTodoTool);
toolRegistry.register(searchChatsTool);
toolRegistry.register(getChatTool);
toolRegistry.register(listChatsTool);

export { loadMcpSettings, loadMcpTools } from './mcp-tools';
/** Built per chat from its settings, so not in the registry (and not published to coding agents). */
export { generateImageTool, GENERATE_IMAGE_TOOL } from './definitions/generate-image.tool';

// Re-export types for convenience
export type { ToolDefinition, ToolContext, ToolResult } from './types';
