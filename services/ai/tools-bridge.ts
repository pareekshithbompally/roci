/**
 * Tool Bridge — Schema & Executable Conversion
 *
 * Converts ToolRegistry tools into AI SDK ToolSet format.
 * - toExecutableTools(): Full tools with execute wrappers, activity tracking, citations.
 *
 * IMPORTANT (AI SDK 5.0+):
 * - Use `inputSchema:` NOT `parameters:` — parameters was removed in 5.0
 * - Return type is ToolSet (from 'ai'), not Record<string, CoreTool>
 */

import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { ToolRegistry } from '@extensions/tools/registry';
import type { ToolContext, ToolResult, MeetingCitation } from '@extensions/tools/types';
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
  onCitations: (citations: MeetingCitation[]) => void;
}

// ── Executable Tools ──

/**
 * Build AI SDK tools with working execute functions from the ToolRegistry.
 *
 * Each tool's execute wrapper handles:
 * - UI activity tracking (calling/done) via onToolActivity
 * - Timeout enforcement (TOOL_TIMEOUT_MS)
 * - Result truncation (MAX_TOOL_RESULT_CHARS)
 * - Citation extraction and forwarding
 * - Error handling (never throws, returns error string)
 *
 * The returned ToolSet can be spread with web search tools and passed to streamText.
 */
export function toExecutableTools(
  registry: ToolRegistry,
  context: ToolContext,
  callbacks: ExecutableToolsCallbacks,
): ToolSet {
  const tools: ToolSet = {};
  let callCounter = 0;

  for (const schema of registry.getSchemas()) {
    const definition = registry.getTool(schema.name);

    tools[schema.name] = tool({
      description: schema.description,
      inputSchema: jsonSchema(schema.parameters as Parameters<typeof jsonSchema>[0]),

      execute: async (args: Record<string, unknown>) => {
        const callId = `agentic-${schema.name}-${++callCounter}`;
        const start = performance.now();

        const toolCall = { id: callId, name: schema.name, arguments: args };

        // Signal: tool execution starting
        callbacks.onToolActivity({
          toolName: schema.name,
          label: labelFor(schema.name),
          status: 'calling',
          toolCall,
        });

        let result: ToolResult;

        try {
          // Execute with timeout race
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error(`Tool "${schema.name}" timed out after ${TOOL_TIMEOUT_MS / 1000}s`)),
              TOOL_TIMEOUT_MS,
            );
          });

          result = await Promise.race([definition.execute(args, context), timeoutPromise]);

          // Truncate oversized results
          if (result.content.length > MAX_TOOL_RESULT_CHARS) {
            result = {
              ...result,
              content: result.content.slice(0, MAX_TOOL_RESULT_CHARS)
                + '\n\n[Result truncated. Ask for specific sections if you need more detail.]',
            };
          }

          // Patch timing and tool call ID
          result = {
            ...result,
            toolCallId: callId,
            meta: { ...result.meta, toolName: schema.name, executionMs: performance.now() - start },
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[ToolBridge] ${schema.name} failed:`, error);

          result = {
            toolCallId: callId,
            content: `Error executing ${schema.name}: ${message}`,
            isError: true,
            meta: { toolName: schema.name, executionMs: performance.now() - start },
          };
        }

        // Extract citations before returning
        const citations = result.meta?.citations;
        if (citations?.length) {
          callbacks.onCitations(citations);
        }

        // Signal: tool execution complete
        callbacks.onToolActivity({
          toolName: schema.name,
          label: labelFor(schema.name),
          status: 'done',
          toolCall,
          result,
        });

        // Return content string — this is what the SDK feeds back to the LLM
        return result.content;
      },
    });
  }

  return tools;
}
