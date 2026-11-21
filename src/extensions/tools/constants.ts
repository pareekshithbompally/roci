/** Tool execution and LLM context limits. */

// ── Tool Execution ──

/** Maximum characters in a single tool result before truncation */
export const MAX_TOOL_RESULT_CHARS = 8_000;

/** Timeout for a single tool execution (ms) */
export const TOOL_TIMEOUT_MS = 30_000;

// ── LLM Context Budget ──

/** A search result's snippet, in characters (the model reads it to decide whether to read the whole item). */
export const MAX_SNIPPET_CHARS = 200;

/** A citation's excerpt, in characters (shown on the answer's source card). */
export const MAX_CITATION_EXCERPT_CHARS = 300;

/** Max transcript characters included in formatForLLM output */
export const MAX_TRANSCRIPT_FOR_LLM = 4_000;

// ── Tool-specific limits ──

/** Most messages read reads back from a chat */
export const MAX_CHAT_MESSAGES_FOR_LLM = 50;

/** Most to-dos find returns */
export const MAX_TODOS_FOR_LLM = 50;
