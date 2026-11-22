/** Connected MCP servers' tools as ToolDefinitions; never throws, so a Rust failure leaves built-in tools only. */

import { mcpService } from '@services/mcp.service';
import type { McpTool, McpToolOutput } from '@services/mcp.service';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { useToolApprovalStore } from '@shared/stores/toolApprovalStore';
import { DEFAULT_MCP_SETTINGS, MCP_CONFIG, mcpToolKey } from '@config/mcp.config';
import type { McpSettings } from '@config/mcp.config';
import type { JSONSchema, ToolDefinition, ToolResult } from './types';
import type { ToolShape } from './tool-tokens';

/** Settings › MCP, read once per chat turn: the saved values, or the defaults where MCP isn't available.
 *  `maxToolCalls` is a whole number of at least one, however the file was edited. */
export async function loadMcpSettings(): Promise<McpSettings> {
  if (!platform.hasMcp || !isTauriEnvironment()) return DEFAULT_MCP_SETTINGS;
  try {
    const { mcpSettings } = await mcpService.getConfig();
    return { ...mcpSettings, maxToolCalls: Math.max(MCP_CONFIG.minToolCalls, Math.floor(mcpSettings.maxToolCalls)) };
  } catch (error: unknown) {
    console.error('[McpTools] Failed to read MCP settings:', error);
    return DEFAULT_MCP_SETTINGS;
  }
}

type ApprovalGate = (tool: McpTool, args: Record<string, unknown>, signal?: AbortSignal) => Promise<boolean>;

/** Connected MCP tools minus those switched off; built-in `reservedNames` win any name clash. */
export async function loadMcpTools(
  reservedNames: ReadonlySet<string>,
  settings: McpSettings,
  disabledKeys: ReadonlySet<string> = new Set(),
): Promise<ToolDefinition[]> {
  if (!platform.hasMcp || !isTauriEnvironment()) return [];
  try {
    const tools = await mcpService.getTools();
    const gate = createApprovalGate(settings);
    return tools
      .filter((tool) => !disabledKeys.has(mcpToolKey(tool.server, tool.name)))
      // MCP Apps: a tool only its screen may call is not the model's.
      .filter((tool) => tool.ui?.visibility?.includes('model') ?? true)
      .filter((tool) => {
        const clashes = reservedNames.has(tool.name);
        if (clashes) console.warn('[McpTools] Skipping tool that shadows a built-in:', `${tool.server}/${tool.name}`);
        return !clashes;
      })
      .map((tool) => toDefinition(tool, gate));
  } catch (error: unknown) {
    console.error('[McpTools] Failed to load MCP tools:', error);
    return [];
  }
}

/** An MCP tool as the model reads it (chat sends this; the Tools menu sizes it). */
export function mcpToolShape(tool: McpTool): ToolShape {
  return {
    name: tool.name,
    description: tool.description || `Tool "${tool.name}" from the ${tool.server} MCP server.`,
    parameters: toObjectSchema(tool.inputSchema),
  };
}

function toDefinition(tool: McpTool, gate: ApprovalGate): ToolDefinition {
  return {
    ...mcpToolShape(tool),
    source: tool.server,
    // Rust bounds the call; the approval prompt may wait on the user, so the bridge must not time it out.
    timeoutMs: null,
    maxResultChars: null,
    execute: async (args, context) => {
      if (!(await gate(tool, args, context.signal))) {
        return result('The user declined to run this tool. Do not retry it; continue without it.', true);
      }
      const output = await callWithCancellation(tool, args, !!tool.ui?.resourceUri, context.signal);
      return result(output.text, output.isError, appMeta(tool, args, output));
    },
  };
}

/** Providers reject a tool schema without `type: object` + `properties`. */
function toObjectSchema(schema: Record<string, unknown>): JSONSchema {
  return { ...schema, type: 'object', properties: (schema.properties ?? {}) as JSONSchema['properties'] };
}

function result(content: string, isError: boolean, meta?: ToolResult['meta']): ToolResult {
  return { toolCallId: '', content, isError, ...(meta && { meta }) };
}

/** A tool with a screen keeps its whole result for it; the bridge fills in the name and timing. */
function appMeta(tool: McpTool, input: Record<string, unknown>, output: McpToolOutput): ToolResult['meta'] {
  const resourceUri = tool.ui?.resourceUri;
  if (!resourceUri || !output.result) return undefined;
  return { toolName: '', executionMs: 0, app: { server: tool.server, resourceUri, input, result: output.result } };
}

/** One call to a connected server, cancelled there when `signal` aborts (the chat stopped, the screen closed). */
async function callWithCancellation(
  tool: McpTool,
  args: Record<string, unknown>,
  withResult: boolean,
  signal?: AbortSignal,
): Promise<McpToolOutput> {
  const cancellationToken = crypto.randomUUID();
  const onAbort = () => {
    mcpService.cancelToolCall(cancellationToken).catch((error: unknown) => {
      console.error('[McpTools] Failed to cancel tool call:', error);
    });
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await mcpService.callTool({ server: tool.server, tool: tool.name, arguments: args, cancellationToken, withResult });
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

// ── Calls from an MCP App screen ──

/** A `CallToolResult` a screen reads as failed. */
const screenError = (text: string): Record<string, unknown> => ({ content: [{ type: 'text', text }], isError: true });

/** A tool call an MCP App screen makes: only to its own server, never to a tool the user switched off or one its server
 *  keeps for the model (`visibility` without `app`), through the same approval as the model's calls, and given up with the
 *  screen (`signal`). The whole result goes back to the screen; the model never sees it. */
export async function callToolFromScreen(
  server: string,
  name: string,
  args: Record<string, unknown>,
  { disabledKeys, signal }: { disabledKeys: ReadonlySet<string>; signal?: AbortSignal },
): Promise<Record<string, unknown>> {
  if (disabledKeys.has(mcpToolKey(server, name))) return screenError(`The tool "${name}" is switched off.`);
  const tool = (await mcpService.getTools()).find((t) => t.server === server && t.name === name);
  if (!tool) return screenError(`${server} offers no tool "${name}".`);
  if (tool.ui?.visibility && !tool.ui.visibility.includes('app')) return screenError(`"${name}" is not callable from its screen.`);
  const gate = createApprovalGate(await loadMcpSettings());
  if (!(await gate(tool, args, signal))) return screenError('The user declined to run this tool.');
  const output = await callWithCancellation(tool, args, true, signal);
  return output.result ?? screenError(output.text);
}

// ── Approval ("Run tools without asking" + per-server grants) ──

/** One gate per turn: an "always allow" answer covers the rest of the turn too. */
function createApprovalGate(settings: McpSettings): ApprovalGate {
  const trusted = new Set(settings.trustedServers);
  return async (tool, args, signal) => {
    if (settings.allowAllTools || trusted.has(tool.server)) return true;
    const decision = await useToolApprovalStore.getState().requestApproval(
      {
        toolCallId: crypto.randomUUID(),
        toolName: tool.name,
        serverName: tool.server,
        argsPreview: JSON.stringify(args, null, 2).slice(0, MCP_CONFIG.approvalArgsPreviewChars),
      },
      signal,
    );
    if (decision === 'allow-always') {
      trusted.add(tool.server);
      await trustServer(tool.server);
    }
    return decision !== 'deny';
  };
}

/** Persist an "always allow" grant. A failed write still allows this call. */
async function trustServer(server: string): Promise<void> {
  try {
    const config = await mcpService.getConfig();
    const trustedServers = [...new Set([...config.mcpSettings.trustedServers, server])];
    await mcpService.saveConfig({ ...config, mcpSettings: { ...config.mcpSettings, trustedServers } });
    await queryClient.invalidateQueries({ queryKey: queryKeys.mcpConfig() });
  } catch (error: unknown) {
    console.error('[McpTools] Failed to save tool permission:', error);
  }
}
