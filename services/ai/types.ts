/**
 * AI SDK Layer — Slim Type Definitions
 */

/** A citation from a web search result */
export interface WebCitation {
  url: string;
  title: string;
  snippet?: string;
}

/** Maps a span of response text to its web citation sources */
export interface InlineCitationSpan {
  startIndex: number;
  endIndex: number;
  sourceIndices: number[];
}

/** Provider type for routing */
export type ProviderType = 'gemini' | 'anthropic' | 'openai' | 'mistral' | 'xai' | 'groq' | 'openai-compat';

/** Tool choice strategy for LLM tool calling */
export type ToolChoice = 'auto' | 'none' | 'required';

/** Standardized token usage (AI SDK 5.0+ field names) */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** Stream metadata for UI state */
export interface StreamMetadata {
  isThinking?: boolean;
  isSearching?: boolean;
  searchQuery?: string;
  thinkingContent?: string;
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
}
