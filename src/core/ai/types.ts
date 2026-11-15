/** Types that flow through the LLM call chain, from request builder to parser. */

/** Provider-agnostic output schema; `name` is optional (only OpenAI requires one). */
export interface OutputSchema {
  name?: string;
  schema: Record<string, unknown>;
}

/** Chat request config built once by buildChatRequest(); the model replies in plain markdown. */
export interface ChatRequestConfig {
  /** The system prompt */
  systemPrompt: string;
}

/** Transcription request config: the prompt describes the JSON fields, the schema enforces them. */
export interface TranscriptionRequestConfig {
  prompt: string;
  outputSchema: OutputSchema | undefined;
}
