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
 * This is the ONE source of truth for what prompt to use and what schema
 * to pass. No other code should make these decisions independently.
 *
 * The prompt ALWAYS describes JSON fields. The schema provides API-level
 * enforcement when the model supports it. If outputSchema is undefined,
 * the prompt still asks for JSON — response parsing handles non-compliance.
 */
export interface ChatRequestConfig {
  /** The system prompt — always describes JSON output fields */
  systemPrompt: string;
  /** The output schema to pass to the adapter. undefined = no API-level enforcement */
  outputSchema: OutputSchema | undefined;
  /** Whether a title field is included in the schema (first message only) */
  includesTitle: boolean;
}

/**
 * Same pattern for transcription requests.
 * Prompt always describes JSON fields. Schema provides API-level enforcement.
 */
export interface TranscriptionRequestConfig {
  prompt: string;
  outputSchema: OutputSchema | undefined;
}
