/** Serves chat's tool registry to coding agents over MCP (memory is read through `find`, never written); writes run with
 *  `approval: 'caller'`. A tool with a screen also gives agents' apps that page and the rows it draws (MCP Apps). */

import { runTool } from '@services/ai';
import { mcpHostService } from '@services/mcpHost.service';
import type { McpHostCall, McpHostRead, McpWireTool } from '@services/mcpHost.service';
import { toolRegistry } from '@extensions/tools';
import { ROCI_SCREENS } from '@config/mcp.config';
import { errorMessage } from '@shared/utils/errors';
import type { ToolDefinition, ToolResult } from './types';

/** One registry tool in MCP's `tools/list` shape. */
export function toWireTool(tool: ToolDefinition): McpWireTool {
  const writes = tool.writes === true;
  return {
    name: tool.name,
    // Here a write saves at once (the agent asked the user already), not on chat's card.
    description: writes ? `${tool.description} Called over MCP, the change is saved at once: ask the user first.` : tool.description,
    inputSchema: { ...tool.parameters },
    annotations: { readOnlyHint: !writes, destructiveHint: writes, openWorldHint: false },
    ...(tool.screen && { _meta: { ui: { resourceUri: tool.screen } } }),
  };
}

/** Listens for agents' calls and screen reads, then publishes the tool list so none is missed; returns the stop function. */
export async function serveTools(): Promise<() => void> {
  const unlistenCalls = await mcpHostService.onCall((call) => { void answer(call); });
  const unlistenReads = await mcpHostService.onRead((read) => { void answerRead(read); });
  await mcpHostService.publishTools(toolRegistry.getTools().map(toWireTool));
  return () => {
    unlistenCalls();
    unlistenReads();
  };
}

/** What a screen draws from a result: the meetings a find returned. */
const screenData = (result: ToolResult): Record<string, unknown> | undefined =>
  result.meta?.meetings ? { meetings: result.meta.meetings } : undefined;

async function answer(call: McpHostCall): Promise<void> {
  const tool = toolRegistry.getTools().find((t) => t.name === call.name);
  try {
    if (!tool) {
      await mcpHostService.reply(call.id, `Unknown tool "${call.name}"`, true);
      return;
    }
    const result = await runTool(tool, call.arguments, { approval: 'caller' }, `mcp-${call.id}`);
    await mcpHostService.reply(call.id, result.content, result.isError, tool.screen ? screenData(result) : undefined);
  } catch (error: unknown) {
    console.error('[McpHost] reply failed:', call.name, error);
  }
}

/** A screen's page, as the app serves it (built by `npm run build:screens`). */
async function screenHtml(uri: string): Promise<string> {
  const screen = Object.values(ROCI_SCREENS).find((s) => s.uri === uri);
  if (!screen) throw new Error(`No screen ${uri}`);
  const response = await fetch(screen.path);
  if (!response.ok) throw new Error(`${screen.path}: ${response.status}`);
  return response.text();
}

async function answerRead(read: McpHostRead): Promise<void> {
  const answer = await screenHtml(read.uri).then(
    (html) => ({ html }),
    (error: unknown) => {
      console.error('[McpHost] reading a screen failed:', read.uri, error);
      return { error: errorMessage(error) };
    },
  );
  await mcpHostService.replyRead(read.id, answer).catch((error: unknown) => console.error('[McpHost] read reply failed:', read.uri, error));
}
