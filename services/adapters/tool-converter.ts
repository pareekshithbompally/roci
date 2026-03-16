/**
 * Tool Converter
 *
 * Centralizes all provider-specific tool format translation.
 * Adapters call these instead of doing their own formatting.
 *
 * Three concerns:
 * 1. toProviderTools()       — ToolSchema[] → provider-native tool definitions
 * 2. parseToolCalls()        — provider event/chunk → ToolCall[]
 * 3. toProviderToolResults() — ToolResult[] + ToolCall[] → provider-native result messages
 */

import type { ProviderType } from './types';
import type { ToolSchema, ToolCall, ToolResult } from '@extensions/tools/types';

// ── 1. Convert ToolSchema[] to provider-native tool definitions ──

export function toProviderTools(schemas: ToolSchema[], providerType: ProviderType): any[] {
  switch (providerType) {
    case 'anthropic':
      return schemas.map(s => ({
        name: s.name,
        description: s.description,
        input_schema: s.parameters,
      }));

    case 'openai':
      // OpenAI Responses API format
      return schemas.map(s => ({
        type: 'function',
        name: s.name,
        description: s.description,
        parameters: s.parameters,
      }));

    case 'gemini':
      // Gemini expects functionDeclarations inside a tools array entry
      return [{
        functionDeclarations: schemas.map(s => ({
          name: s.name,
          description: s.description,
          parameters: s.parameters,
        })),
      }];

    case 'openai-compat':
      // Chat Completions API format
      return schemas.map(s => ({
        type: 'function',
        function: {
          name: s.name,
          description: s.description,
          parameters: s.parameters,
        },
      }));

    default:
      return [];
  }
}

// ── 2. Parse provider events/chunks into ToolCall[] ──

/**
 * Parse Anthropic accumulated tool use blocks into ToolCall[].
 * Called after accumulating content blocks during streaming.
 */
export function parseAnthropicToolCalls(
  toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }>
): ToolCall[] {
  return toolUseBlocks.map(block => ({
    id: block.id,
    name: block.name,
    arguments: block.input,
  }));
}

/**
 * Parse OpenAI Responses API function call items into ToolCall[].
 */
export function parseOpenAIToolCalls(
  functionCalls: Array<{ call_id: string; name: string; arguments: string }>
): ToolCall[] {
  return functionCalls.map(fc => ({
    id: fc.call_id,
    name: fc.name,
    arguments: safeParseJSON(fc.arguments),
  }));
}

/**
 * Parse Gemini function call parts into ToolCall[].
 * Uses the API-provided id when present (required by Gemini 2.x for response matching).
 */
export function parseGeminiToolCalls(
  functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }>
): ToolCall[] {
  return functionCalls.map((fc, idx) => ({
    id: fc.id || `gemini-tc-${Date.now()}-${idx}`,
    name: fc.name,
    arguments: fc.args || {},
  }));
}

/**
 * Parse OpenAI-compat Chat Completions tool call deltas into ToolCall[].
 * Expects already-accumulated tool calls (name + args assembled from deltas).
 */
export function parseOpenAICompatToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>
): ToolCall[] {
  return toolCalls.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: safeParseJSON(tc.function.arguments),
  }));
}

// ── 3. Convert ToolResult[] to provider-native result messages ──

export function toProviderToolResults(
  results: ToolResult[],
  toolCalls: ToolCall[],
  providerType: ProviderType
): any[] {
  switch (providerType) {
    case 'anthropic':
      // Anthropic: user message with tool_result content blocks
      return [{
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result',
          tool_use_id: r.toolCallId,
          content: r.content,
          is_error: r.isError || undefined,
        })),
      }];

    case 'openai':
      // OpenAI Responses API: function_call_output items in input
      return results.map(r => ({
        type: 'function_call_output',
        call_id: r.toolCallId,
        output: r.content,
      }));

    case 'gemini': {
      // Gemini: functionResponse parts in a single user/function message
      const responseParts = results.map(r => {
        const matchingCall = toolCalls.find(tc => tc.id === r.toolCallId);
        return {
          functionResponse: {
            name: matchingCall?.name || 'unknown',
            response: { result: r.content },
          },
        };
      });
      return [{ role: 'user', parts: responseParts }];
    }

    case 'openai-compat':
      // Chat Completions: tool role messages
      return results.map(r => ({
        role: 'tool',
        tool_call_id: r.toolCallId,
        content: r.content,
      }));

    default:
      return [];
  }
}

/**
 * Build the assistant tool-call message for conversation history.
 * Needed by Anthropic and OpenAI-compat to maintain proper message ordering.
 */
export function toProviderAssistantToolCall(
  toolCalls: ToolCall[],
  textBefore: string | undefined,
  providerType: ProviderType
): any {
  switch (providerType) {
    case 'anthropic': {
      const content: any[] = [];
      if (textBefore) {
        content.push({ type: 'text', text: textBefore });
      }
      for (const tc of toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      return { role: 'assistant', content };
    }

    case 'openai-compat': {
      return {
        role: 'assistant',
        content: textBefore || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }

    // OpenAI Responses API and Gemini handle this differently (history is managed by the SDK)
    default:
      return null;
  }
}

// ── Helpers ──

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    console.warn('[tool-converter] Failed to parse tool arguments:', str);
    return {};
  }
}
