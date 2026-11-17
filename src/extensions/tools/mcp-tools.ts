/** Connected MCP servers' tools as ToolDefinitions; never throws, so a Rust failure leaves built-in tools only. */

import { mcpService } from '@services/mcp.service';
import type { McpTool } from '@services/mcp.service';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { useToolApprovalStore } from '@shared/stores/toolApprovalStore';
import { MCP_CONFIG, mcpToolKey } from '@config/mcp.config';
import type { McpSettings } from '@config/mcp.config';
import type { JSONSchema, ToolDefinition, ToolResult } from './types';

type ApprovalGate = (tool: McpTool, args: Record<string, unknown>, signal?: AbortSignal) => Promise<boolean>;

/** Connected MCP tools minus those switched off; built-in `reservedNames` win any name clash. */
export async function loadMcpTools(
  reservedNames: ReadonlySet<string>,
  disabledKeys: ReadonlySet<string> = new Set(),
): Promise<ToolDefinition[]> {
  if (!platform.hasMcp || !isTauriEnvironment()) return [];
  try {
    const [tools, config] = await Promise.all([mcpService.getTools(), mcpService.getConfig()]);
    const gate = createApprovalGate(config.mcpSettings);
    return tools
      .filter((tool) => !disabledKeys.has(mcpToolKey(tool.server, tool.name)))
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

function toDefinition(tool: McpTool, gate: ApprovalGate): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description || `Tool "${tool.name}" from the ${tool.server} MCP server.`,
    parameters: toObjectSchema(tool.inputSchema),
    source: tool.server,
    // Rust bounds the call; the approval prompt may wait on the user, so the bridge must not time it out.
    timeoutMs: null,
    maxResultChars: null,
    execute: async (args, context) => {
      if (!(await gate(tool, args, context.signal))) {
        return result('The user declined to run this tool. Do not retry it; continue without it.', true);
      }
      return callWithCancellation(tool, args, context.signal);
    },
  };
}

/** Providers reject a tool schema without `type: object` + `properties`. */
function toObjectSchema(schema: Record<string, unknown>): JSONSchema {
  return { ...schema, type: 'object', properties: (schema.properties ?? {}) as JSONSchema['properties'] };
}

function result(content: string, isError: boolean): ToolResult {
  return { toolCallId: '', content, isError };
}

async function callWithCancellation(
  tool: McpTool,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const cancellationToken = crypto.randomUUID();
  const onAbort = () => {
    mcpService.cancelToolCall(cancellationToken).catch((error: unknown) => {
      console.error('[McpTools] Failed to cancel tool call:', error);
    });
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const output = await mcpService.callTool({
      server: tool.server,
      tool: tool.name,
      arguments: args,
      cancellationToken,
    });
    return result(output.text, output.isError);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
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
