/** A citation from a web search result */
export interface WebCitation {
  url: string;
  title: string;
  snippet?: string;
}

/** Provider type for routing */
export type ProviderType = 'gemini' | 'anthropic' | 'openai' | 'mistral' | 'groq' | 'openai-compat' | 'apple-intelligence' | 'on-device';

/** Tool choice strategy for LLM tool calling */
export type ToolChoice = 'auto' | 'none' | 'required';

/** Standardized token usage (AI SDK 5.0+ field names) */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

/** Extract full token usage from AI SDK's LanguageModelUsage object */
export function extractTokenUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
}): TokenUsage {
  return {
    inputTokens: usage.inputTokens ?? undefined,
    outputTokens: usage.outputTokens ?? undefined,
    totalTokens: usage.totalTokens ?? undefined,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? undefined,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? undefined,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? undefined,
  };
}

/** Sum two TokenUsage objects field-by-field */
export function mergeTokenUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage {
  if (!a) return b ?? {};
  if (!b) return a;
  const sum = (x?: number, y?: number) => (x ?? 0) + (y ?? 0) || undefined;
  return {
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens: sum(a.outputTokens, b.outputTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens),
    cacheReadTokens: sum(a.cacheReadTokens, b.cacheReadTokens),
    cacheWriteTokens: sum(a.cacheWriteTokens, b.cacheWriteTokens),
    reasoningTokens: sum(a.reasoningTokens, b.reasoningTokens),
  };
}

/** What happens before the reply starts: the model list's first download, then what a local runtime reports (llama-server, llama.cpp in the app). */
export interface StreamProgress {
  /** Getting the models.dev list; loading the model's main weights, its draft model or its vision/audio projector; then reading the prompt. */
  stage: 'loading-catalog' | 'loading-weights' | 'loading-draft' | 'loading-projector' | 'reading-prompt';
  /** 0–100; null when the runtime reports the stage but no fraction (llama.cpp in the app reports only the load's start). */
  percent: number | null;
  /** Seconds left reading the prompt, once enough of it has been read to tell. */
  secondsLeft?: number;
}

/** Tokens a local server has generated so far, and how fast (llama-server). */
export interface GenerationStats {
  tokens: number;
  /** Time spent generating so far, ms. */
  elapsedMs: number;
  tokensPerSecond: number;
}
