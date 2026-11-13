/**
 * Tool System Type Definitions
 *
 * Provider-agnostic interfaces for the tool calling system.
 * Adapters translate to/from these for each LLM provider.
 */

import type { HistoryItem } from '@shared/types';

// ── JSON Schema (subset used for tool parameter definitions) ──

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  items?: JSONSchemaProperty;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
}

// ── Tool Definition (registered by each tool file) ──

export interface ToolDefinition {
  /** Unique identifier, snake_case. Must match what adapters send to providers. */
  name: string;
  /** Shown to LLM as tool description. Quality matters for tool selection. */
  description: string;
  /** JSON Schema for input validation. */
  parameters: JSONSchema;
  /** The actual implementation. Receives validated params + context. */
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
  /**
   * Bridge-enforced limits. Omit for the defaults (TOOL_TIMEOUT_MS /
   * MAX_TOOL_RESULT_CHARS); `null` when the tool enforces its own — MCP tools
   * are bounded in Rust by the user's settings and may wait on an approval prompt.
   */
  timeoutMs?: number | null;
  maxResultChars?: number | null;
  /** MCP server name, shown with the call in chat. Absent for built-ins. */
  source?: string;
}

// ── Tool Context (passed by orchestrator to tool execute()) ──

export interface ToolContext {
  /** All meetings available for lookup. */
  historyItems: HistoryItem[];
  /** For cancellation during tool execution. */
  signal?: AbortSignal;
}

// ── Tool Call (emitted by adapter when LLM requests a tool) ──

export interface ToolCall {
  /** Provider-assigned ID for result matching. */
  id: string;
  /** Tool name. */
  name: string;
  /** Parsed arguments from the LLM. */
  arguments: Record<string, unknown>;
}

// ── Tool Result (returned by executor) ──

export interface ToolResult {
  /** Matches ToolCall.id. */
  toolCallId: string;
  /** Stringified result for LLM consumption. */
  content: string;
  /** If true, content is an error message. */
  isError: boolean;
  /** UI-only metadata. Not sent to LLM. */
  meta?: ToolResultMeta;
}

// ── Meeting Citation (UI-only, not sent to LLM) ──

export interface MeetingCitation {
  meetingId: string;
  meetingTitle: string;
  meetingTimestamp: number;  // epoch ms when meeting occurred
  excerpt: string;           // chunkText (best-scoring chunk for this meeting)
  score: number;
}

export interface ToolResultMeta {
  toolName: string;
  executionMs: number;
  resultCount?: number;
  /** UI-only citation cards to surface after search_meetings runs */
  citations?: MeetingCitation[];
}

// ── Tool Schema (returned by registry for adapter consumption) ──

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JSONSchema;
}
