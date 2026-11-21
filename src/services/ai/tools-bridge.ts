/** Registry and MCP tools as an AI SDK 5 ToolSet (schemas use `inputSchema:`, not the removed `parameters:`). */

import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { ToolContext, ToolDefinition, ToolResult } from '@extensions/tools/types';
import { MAX_TOOL_RESULT_CHARS, TOOL_TIMEOUT_MS } from '@extensions/tools/constants';
import { errorMessage } from '@shared/utils/errors';

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

/** Run one tool with its limits; never throws. Chat (below) and Roci's MCP server share it. */
export async function runTool(
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
    const message = errorMessage(error);
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

/** Executable tools with timeouts and truncation; execute never throws, returns the full result (its tool row reads it
 *  from the stream), and the model is given only its text. */
export function toExecutableTools(definitions: ToolDefinition[], context: ToolContext): ToolSet {
  const tools: ToolSet = {};
  for (const definition of definitions) {
    tools[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.parameters as Parameters<typeof jsonSchema>[0]),
      execute: (args: Record<string, unknown>, { toolCallId }) => runTool(definition, args, context, toolCallId),
      // The MCP server a tool came from rides on its parts in the chat (the SDK's `toolMetadata`); never sent to the model.
      ...(definition.source && { metadata: { source: definition.source } }),
      // A failed call goes back as an error, so providers that mark one (Anthropic's is_error) do.
      toModelOutput: ({ output }: { output: ToolResult }) => ({ type: output.isError ? ('error-text' as const) : ('text' as const), value: output.content }),
    });
  }
  return tools;
}
