/**
 * LLM Adapter Abstraction Layer — Types
 */

import type { ChatMessage, ChatPart } from '@/types';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { ToolCall, ToolResult, ToolSchema } from '@extensions/tools/types';
import type { OutputSchema } from '@core/ai/types';

export type ProviderType = 'gemini' | 'anthropic' | 'openai' | 'openai-compat';

/** Standardized token usage returned by adapters */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** A citation from a web search result */
export interface WebCitation {
  url: string;
  title: string;
  /** Short excerpt from the cited page (provider-dependent) */
  snippet?: string;
}

/** Maps a span of response text to its web citation sources */
export interface InlineCitationSpan {
  /** Character offset — start of the cited span in the completed text */
  startIndex: number;
  /** Character offset — end of the cited span */
  endIndex: number;
  /** Indexes into the parent message's webCitations[] array */
  sourceIndices: number[];
}

/** Stream metadata passed with each text chunk */
export interface StreamMetadata {
  isThinking?: boolean;
  isSearching?: boolean;
  searchQuery?: string;
  thinkingContent?: string;
  /** Web citations extracted from provider response (typically on final chunk) */
  webCitations?: WebCitation[];
  /** Inline citation spans mapping text ranges to source indices */
  inlineCitations?: InlineCitationSpan[];
}

/** Options for streaming chat */
export interface ChatStreamOptions {
  messages: ChatMessage[];
  resolved: ResolvedModel;
  systemPrompt: string;
  webSearchEnabled?: boolean;
  signal?: AbortSignal;
  outputSchema?: OutputSchema;
}

/** Callbacks for streaming chat */
export interface StreamCallbacks {
  onChunk: (text: string, metadata?: StreamMetadata) => void;
  onMediaPart?: (part: ChatPart) => void;
}

/** Options for non-streaming chat */
export interface ChatOptions {
  messages: ChatMessage[];
  resolved: ResolvedModel;
  systemPrompt: string;
  outputSchema?: OutputSchema;
}

/** Options for audio transcription */
export interface TranscriptionOptions {
  audioBlob: Blob;
  resolved: ResolvedModel;
  prompt: string;
  outputSchema?: OutputSchema;
}

/** Options for document processing */
export interface DocumentOptions {
  file: File;
  resolved: ResolvedModel;
  prompt: string;
  outputSchema?: OutputSchema;
}

// ── Tool-aware streaming types ──

/** Emitted by adapter when LLM requests tool calls */
export interface ToolCallEvent {
  toolCalls: ToolCall[];
  textBefore?: string;
}

/** Callbacks for tool-aware streaming */
export interface ToolStreamCallbacks extends StreamCallbacks {
  onToolCall: (event: ToolCallEvent) => void;
}

/** Provider-agnostic tool choice hint */
export type ToolChoice = 'auto' | 'none' | 'required';

/** Options for tool-aware streaming */
export interface ToolStreamOptions extends ChatStreamOptions {
  tools?: ToolSchema[];
  toolMessages?: ToolMessage[];
  toolChoice?: ToolChoice;
  /** Opaque state returned by a previous adapter call. Used by adapters that need
   *  cross-round continuity (e.g., OpenAI previous_response_id). */
  adapterState?: unknown;
}

/** Result returned by chatStreamWithTools */
export interface AdapterStreamResult {
  tokenUsage?: TokenUsage;
  /** Opaque state for the orchestrator to pass back on the next round. */
  adapterState?: unknown;
}

/** Messages exchanged during tool calling turns */
export type ToolMessage =
  | { role: 'assistant_tool_call'; toolCalls: ToolCall[]; textBefore?: string }
  | { role: 'tool_result'; results: ToolResult[] };

/** The adapter interface every provider must implement */
export interface ILLMAdapter {
  readonly type: ProviderType;

  chatStream(options: ChatStreamOptions, callbacks: StreamCallbacks): Promise<TokenUsage | undefined>;
  chat(options: ChatOptions): Promise<{ text: string }>;
  processAudio(options: TranscriptionOptions): Promise<string>;
  processDocument(options: DocumentOptions): Promise<string>;

  /** Optional: tool-aware streaming. Adapters that support tool calling implement this. */
  chatStreamWithTools?(options: ToolStreamOptions, callbacks: ToolStreamCallbacks): Promise<AdapterStreamResult | undefined>;
}
