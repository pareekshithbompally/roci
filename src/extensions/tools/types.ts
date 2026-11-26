/** Provider-agnostic tool calling interfaces. */

import type { GeneratedImage } from '@shared/types';
import type { ResultView } from '@core/ai';

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
  /** JSON Schema of the arguments, as the model is shown it (built-ins derive it from zod: see contract.ts). */
  parameters: JSONSchema;
  /** Runs the call; built-ins check `params` against their schema first and answer a bad call with an error. */
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
  /** Bridge limits: omit for defaults, `null` when the tool bounds itself (MCP tools, in Rust). */
  timeoutMs?: number | null;
  maxResultChars?: number | null;
  /** MCP server name, shown with the call in chat. Absent for built-ins. */
  source?: string;
  /** Changes the user's data. Agents using Roci's MCP server are told so (they ask before calling it). */
  writes?: boolean;
  /** MCP Apps: the screen (`ui://roci/…`) Roci's MCP server gives agents' apps for this tool's results. */
  screen?: string;
  /** Chat sends it only once the model finds it with `tool_search` (the AI SDK's `deferLoading`). */
  deferLoading?: boolean;
}

// ── Tool Context (passed by orchestrator to tool execute()) ──

export interface ToolContext {
  /** For cancellation during tool execution. */
  signal?: AbortSignal;
  /** Who confirms a write: `chat` shows a proposal; `caller` is an MCP agent that already asked the user. */
  approval: 'chat' | 'caller';
  /** The chat the call is part of (none for an MCP agent's call): a tool that calls a model records its usage under it. */
  sessionId?: string;
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

// ── Document Citation (UI-only, not sent to LLM) ──

/** A document passage an answer drew on: the document (by its app path), its page, the words. */
export interface DocumentCitation {
  path: string;
  name: string;
  /** From 1; none for a text file. */
  page: number | null;
  excerpt: string;
  score: number;
}

export interface ToolResultMeta {
  toolName: string;
  executionMs: number;
  resultCount?: number;
  /** UI-only citation cards: the meetings a find or read drew on */
  citations?: MeetingCitation[];
  /** UI-only citation rows: the document passages a find or read drew on, each with its page */
  documentCitations?: DocumentCitation[];
  /** UI-only: an image the tool made, shown in the reply where the tool ran (generate_image). */
  image?: GeneratedImage;
  /** UI-only: the MCP App screen an MCP tool declared, shown in the reply where the tool ran. */
  app?: McpAppMeta;
  /** UI-only: a chart, figures or table `show` drew, shown in the reply where the tool ran. */
  view?: ResultView;
  /** UI-only: the meetings a meeting find returned, listed in its row. */
  meetings?: MeetingRow[];
}

/** One meeting a find returned, as its row lists it. */
export interface MeetingRow {
  id: string;
  title: string;
  /** When it was, as the model read it. */
  date: string;
  /** The passage that matched, for a search. */
  snippet?: string;
}

/** What shows in the reply right after a tool's row: an image it made, a plugin's screen, or a view `show` drew. */
export type ToolView =
  | { kind: 'image'; image: GeneratedImage }
  | { kind: 'app'; app: McpAppMeta; title: string }
  | ResultView;

/** What an MCP App screen needs to show a call: where it lives, and the call's input and whole result. */
export interface McpAppMeta {
  server: string;
  resourceUri: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

