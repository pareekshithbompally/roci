/**
 * Tool Schema Bridge
 *
 * Converts our ToolSchema[] (JSON Schema) to the AI SDK's tool format.
 * Uses jsonSchema() from the AI SDK which accepts raw JSON Schema
 * without requiring Zod conversion.
 *
 * IMPORTANT (AI SDK 5.0+):
 * - Use `inputSchema:` NOT `parameters:` — parameters was removed in 5.0
 * - Return type is ToolSet (from 'ai'), not Record<string, CoreTool>
 */

import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { ToolSchema } from '@extensions/tools/types';

/**
 * Convert our ToolSchema[] to AI SDK tool definitions (declaration-only, no execute).
 * Used when you only need to declare tools to the LLM without executing them locally.
 * Phase 3 adds execute functions via buildExecutableTools() in the orchestrator.
 */
export function toAISDKTools(schemas: ToolSchema[]): ToolSet {
  const tools: ToolSet = {};
  for (const schema of schemas) {
    tools[schema.name] = tool({
      description: schema.description,
      inputSchema: jsonSchema(schema.parameters as Parameters<typeof jsonSchema>[0]),
    });
  }
  return tools;
}
