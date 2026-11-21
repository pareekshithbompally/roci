/** Tool execution and LLM context limits. */

// ── Tool Execution ──

/** Maximum characters in a single tool result before truncation */
export const MAX_TOOL_RESULT_CHARS = 8_000;

/** Timeout for a single tool execution (ms) */
export const TOOL_TIMEOUT_MS = 30_000;

// ── LLM Context Budget ──

/** Total character budget for all retrieved context injected into LLM */
export const MAX_CONTEXT_BUDGET_CHARS = 24_000;

/** Max transcript characters included in formatForLLM output */
export const MAX_TRANSCRIPT_FOR_LLM = 4_000;

// ── Tool-specific limits ──

/** Most messages read reads back from a chat */
export const MAX_CHAT_MESSAGES_FOR_LLM = 50;

/** Most to-dos find returns */
export const MAX_TODOS_FOR_LLM = 50;
