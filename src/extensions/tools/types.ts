/** Provider-agnostic tool calling interfaces. */

import type { HistoryItem, ImagePart } from '@shared/types';

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
  /** Bridge limits: omit for defaults, `null` when the tool bounds itself (MCP tools, in Rust). */
  timeoutMs?: number | null;
  maxResultChars?: number | null;
  /** MCP server name, shown with the call in chat. Absent for built-ins. */
  source?: string;
  /** Changes the user's data. Agents using Roci's MCP server are told so (they ask before calling it). */
  writes?: boolean;
}

// ── Tool Context (passed by orchestrator to tool execute()) ──

export interface ToolContext {
  /** All meetings available for lookup. */
  historyItems: HistoryItem[];
  /** For cancellation during tool execution. */
  signal?: AbortSignal;
  /** Who confirms a write: `chat` shows a proposal; `caller` is an MCP agent that already asked the user. */
  approval: 'chat' | 'caller';
}

// ── Tool Result (returned by executor) ──

export interface ToolResult {
  /** The SDK's id for the call this result answers. */
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
  /** UI-only: an image the tool made, shown in the reply where the tool ran (generate_image). */
  image?: ImagePart;
}

