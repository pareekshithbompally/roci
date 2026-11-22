/** Registers every tool definition and exports the registry singleton. */

import { ToolRegistry } from './registry';
import { findTool } from './definitions/find.tool';
import { readTool } from './definitions/read.tool';
import { suggestTodoTool } from './definitions/suggest-todo.tool';

export const toolRegistry = new ToolRegistry();
toolRegistry.register(findTool);
toolRegistry.register(readTool);
toolRegistry.register(suggestTodoTool);

export { callToolFromScreen, loadMcpSettings, loadMcpTools } from './mcp-tools';
/** Built per chat from its settings, so not in the registry (and not published to coding agents). */
export { generateImageTool, GENERATE_IMAGE_TOOL } from './definitions/generate-image.tool';
/** Chat only: draws in Roci's chat, which an agent using Roci's MCP server doesn't show. */
export { showTool, SHOW_TOOL } from './definitions/show.tool';
/** Chat only, while Memory is on: memory is never written from outside Roci. */
export { suggestMemoryTool } from './definitions/suggest-memory.tool';

// Re-export types for convenience
export type { ToolDefinition, ToolContext, ToolResult } from './types';
