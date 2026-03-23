/**
 * Shared AI Types
 *
 * Types that flow through the entire LLM call chain:
 * request builder → unified service → orchestrator → adapter → callback → parser.
 */

/**
 * Provider-agnostic output schema descriptor.
 * Each adapter maps this to its native structured output parameter.
 *
 * `name` is optional — only OpenAI requires it. Adapters that need a name
 * and don't receive one should derive it (e.g., from the schema's top-level
 * property names or use a sensible default like 'response').
 */
export interface OutputSchema {
  name?: string;
  schema: Record<string, unknown>;
}

/**
 * The single configuration object for an LLM chat request.
 * Built once by buildChatRequest(), threaded through the entire chain.
 *
 * The model responds with plain text (markdown). Suggestions are generated
 * via a separate async call after the response completes.
 */
export interface ChatRequestConfig {
  /** The system prompt */
  systemPrompt: string;
}

/**
 * Same pattern for transcription requests.
 * Prompt always describes JSON fields. Schema provides API-level enforcement.
 */
export interface TranscriptionRequestConfig {
  prompt: string;
  outputSchema: OutputSchema | undefined;
}
