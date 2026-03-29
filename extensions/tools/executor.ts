/**
 * Tool Executor
 *
 * Runs a tool by name with given arguments.
 * Wraps registry lookup + execution + error handling + timing.
 * Tool errors are non-fatal — always returns a ToolResult, never throws.
 */

import type { ToolCall, ToolContext, ToolResult } from './types';
import type { ToolRegistry } from './registry';
import { MAX_TOOL_RESULT_CHARS, TOOL_TIMEOUT_MS } from './constants';

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  /** Execute a tool call. Never throws — errors become ToolResult { isError: true }. */
  async execute(call: ToolCall, context: ToolContext): Promise<ToolResult> {
    const start = performance.now();

    // Look up the tool
    let tool;
    try {
      tool = this.registry.getTool(call.name);
    } catch {
      return {
        toolCallId: call.id,
        content: `Error: Unknown tool "${call.name}"`,
        isError: true,
        meta: { toolName: call.name, executionMs: performance.now() - start },
      };
    }

    // Validate required parameters
    const required = tool.parameters.required ?? [];
    for (const key of required) {
      if (call.arguments[key] === undefined || call.arguments[key] === null) {
        return {
          toolCallId: call.id,
          content: `Error: Missing required parameter "${key}"`,
          isError: true,
          meta: { toolName: call.name, executionMs: performance.now() - start },
        };
      }
    }

    // Check for abort before executing
    if (context.signal?.aborted) {
      return {
        toolCallId: call.id,
        content: 'Error: Operation was cancelled',
        isError: true,
        meta: { toolName: call.name, executionMs: performance.now() - start },
      };
    }

    // Execute with timeout
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Tool "${call.name}" timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS);
      });
      const result = await Promise.race([tool.execute(call.arguments, context), timeoutPromise]);
      const executionMs = performance.now() - start;

      // Truncate large results before feeding back to LLM
      let content = result.content;
      if (content.length > MAX_TOOL_RESULT_CHARS) {
        content = content.slice(0, MAX_TOOL_RESULT_CHARS)
          + '\n\n[Result truncated. Ask for specific sections if you need more detail.]';
      }

      // Patch timing into meta
      return {
        ...result,
        content,
        toolCallId: call.id,
        meta: {
          ...result.meta,
          toolName: call.name,
          executionMs,
        },
      };
    } catch (error) {
      const executionMs = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ToolExecutor] ${call.name} failed:`, error);

      return {
        toolCallId: call.id,
        content: `Error executing ${call.name}: ${message}`,
        isError: true,
        meta: { toolName: call.name, executionMs },
      };
    }
  }
}
