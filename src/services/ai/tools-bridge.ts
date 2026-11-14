/**
 * Tool Bridge — Schema & Executable Conversion
 *
 * Converts tool definitions (registry + MCP) into AI SDK ToolSet format.
 * - toExecutableTools(): Full tools with execute wrappers and activity tracking.
 *
 * IMPORTANT (AI SDK 5.0+):
 * - Use `inputSchema:` NOT `parameters:` — parameters was removed in 5.0
 * - Return type is ToolSet (from 'ai'), not Record<string, CoreTool>
 */

import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { ToolContext, ToolDefinition, ToolResult } from '@extensions/tools/types';
import type { ToolActivity } from '@extensions/tool-orchestrator/types';
import { MAX_TOOL_RESULT_CHARS, TOOL_TIMEOUT_MS } from '@extensions/tools/constants';

// ── Friendly labels for UI activity indicators ──

const TOOL_LABELS: Record<string, string> = {
  search_meetings: 'Searching meetings\u2026',
  get_meeting: 'Loading meeting\u2026',
  list_meetings: 'Listing meetings\u2026',
  get_action_items: 'Getting action items\u2026',
  manage_todo: 'Managing todo\u2026',
  query_graph: 'Querying knowledge graph\u2026',
  search_chats: 'Searching chats\u2026',
  get_chat: 'Loading chat\u2026',
  list_chats: 'Listing chats\u2026',
};

function labelFor(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Running ${toolName}\u2026`;
}

// ── Types ──

export interface ExecutableToolsCallbacks {
  onToolActivity: (activity: ToolActivity) => void;
}

// ── Limits ──

/** Race `work` against the tool's timeout (`null` = the tool bounds itself). */
function withTimeout<T>(work: Promise<T>, toolName: string, timeoutMs: number | null): Promise<T> {
  if (timeoutMs === null) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function truncate(result: ToolResult, maxChars: number | null): ToolResult {
  if (maxChars === null || result.content.length <= maxChars) return result;
  return {
    ...result,
    content: result.content.slice(0, maxChars)
      + '\n\n[Result truncated. Ask for specific sections if you need more detail.]',
  };
}

async function runTool(
  definition: ToolDefinition,
  args: Record<string, unknown>,
  context: ToolContext,
  callId: string,
): Promise<ToolResult> {
  const start = performance.now();
  try {
    const timeoutMs = definition.timeoutMs === undefined ? TOOL_TIMEOUT_MS : definition.timeoutMs;
    const maxChars = definition.maxResultChars === undefined ? MAX_TOOL_RESULT_CHARS : definition.maxResultChars;
    const raw = await withTimeout(definition.execute(args, context), definition.name, timeoutMs);
    const result = truncate(raw, maxChars);
    return {
      ...result,
      toolCallId: callId,
      meta: { ...result.meta, toolName: definition.name, executionMs: performance.now() - start },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ToolBridge] ${definition.name} failed:`, error);
    return {
      toolCallId: callId,
      content: `Error executing ${definition.name}: ${message}`,
      isError: true,
      meta: { toolName: definition.name, executionMs: performance.now() - start },
    };
  }
}

// ── Executable Tools ──

/**
 * Build AI SDK tools with working execute functions from tool definitions
 * (the built-in registry plus any connected MCP tools).
 *
 * Each tool's execute wrapper handles:
 * - UI activity tracking (calling/done) via onToolActivity
 * - Timeout enforcement and result truncation (per-definition limits)
 * - Citations ride on the 'done' activity's result.meta.citations
 * - Error handling (never throws, returns error string)
 *
 * The returned ToolSet can be spread with web search tools and passed to streamText.
 */
export function toExecutableTools(
  definitions: ToolDefinition[],
  context: ToolContext,
  callbacks: ExecutableToolsCallbacks,
): ToolSet {
  const tools: ToolSet = {};
  let callCounter = 0;

  for (const definition of definitions) {
    const { name } = definition;

    tools[name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.parameters as Parameters<typeof jsonSchema>[0]),

      execute: async (args: Record<string, unknown>) => {
        const callId = `agentic-${name}-${++callCounter}`;
        const toolCall = { id: callId, name, arguments: args };

        const { source } = definition;
        callbacks.onToolActivity({ toolName: name, source, label: labelFor(name), status: 'calling', toolCall });

        const result = await runTool(definition, args, context, callId);

        callbacks.onToolActivity({ toolName: name, source, label: labelFor(name), status: 'done', toolCall, result });

        // Content string — what the SDK feeds back to the LLM
        return result.content;
      },
    });
  }

  return tools;
}
