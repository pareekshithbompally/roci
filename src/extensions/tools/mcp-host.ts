/**
 * Kasset's tools as an MCP server — the registry chat uses, served to coding
 * agents through Rust (src-tauri/src/mcp_server). One registry, one runner
 * (`runTool`): chat and agents get the same tools and the same limits.
 *
 * Agents ask the user before a tool that writes (`destructiveHint`), so writes
 * run with `approval: 'caller'` — saved at once, no chat proposal.
 */

import { runTool } from '@services/ai';
import { mcpHostService } from '@services/mcpHost.service';
import type { McpHostCall, McpWireTool } from '@services/mcpHost.service';
import { queryClient } from '@shared/query/queryClient';
import { meetingsQuery } from '@shared/contexts/HistoryContext';
import { toolRegistry } from '@extensions/tools';
import type { ToolDefinition } from './types';

/** One registry tool in MCP's `tools/list` shape. */
export function toWireTool(tool: ToolDefinition): McpWireTool {
  const writes = tool.writes === true;
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { ...tool.parameters },
    annotations: { readOnlyHint: !writes, destructiveHint: writes, openWorldHint: false },
  };
}

/**
 * Answer agents' calls and publish the tool list (listen first, so no call
 * is missed). Returns the stop function.
 */
export async function serveTools(): Promise<() => void> {
  const unlisten = await mcpHostService.onCall((call) => { void answer(call); });
  await mcpHostService.publishTools(toolRegistry.getTools().map(toWireTool));
  return unlisten;
}

async function answer(call: McpHostCall): Promise<void> {
  const { text, isError } = await execute(call);
  try {
    await mcpHostService.reply(call.id, text, isError);
  } catch (error: unknown) {
    console.error('[McpHost] reply failed:', call.name, error);
  }
}

async function execute(call: McpHostCall): Promise<{ text: string; isError: boolean }> {
  const tool = toolRegistry.getTools().find((t) => t.name === call.name);
  if (!tool) return { text: `Unknown tool "${call.name}"`, isError: true };
  try {
    const historyItems = await queryClient.fetchQuery(meetingsQuery);
    const result = await runTool(tool, call.arguments, { historyItems, approval: 'caller' }, `mcp-${call.id}`);
    return { text: result.content, isError: result.isError };
  } catch (error: unknown) {
    console.error('[McpHost] could not load meetings for', call.name, error);
    return { text: `Kasset could not load meetings: ${error instanceof Error ? error.message : String(error)}`, isError: true };
  }
}
