/**
 * Tool System Entry Point
 *
 * Registers all tool definitions and exports the registry + executor singletons.
 */

import { ToolRegistry } from './registry';
import { ToolExecutor } from './executor';
import { searchMeetingsTool } from './definitions/search-meetings.tool';
import { getMeetingTool } from './definitions/get-meeting.tool';
import { listMeetingsTool } from './definitions/list-meetings.tool';
import { getActionItemsTool } from './definitions/get-action-items.tool';

export const toolRegistry = new ToolRegistry();
toolRegistry.register(searchMeetingsTool);
toolRegistry.register(getMeetingTool);
toolRegistry.register(listMeetingsTool);
toolRegistry.register(getActionItemsTool);

export const toolExecutor = new ToolExecutor(toolRegistry);

// Re-export types for convenience
export type { ToolDefinition, ToolContext, ToolCall, ToolResult, ToolSchema } from './types';
