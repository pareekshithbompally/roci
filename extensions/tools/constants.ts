/**
 * Tool System Constants
 *
 * Single source of truth for all tool execution and LLM context limits.
 * Import from here — never hardcode these values in tool definitions.
 */

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

/** Max messages returned by get_chat tool */
export const MAX_CHAT_MESSAGES_FOR_LLM = 50;

/** Max meetings scanned by get_action_items when no specific meeting given */
export const MAX_ACTION_ITEM_MEETINGS = 10;

/** Max total action items returned by get_action_items */
export const MAX_ACTION_ITEMS_FOR_LLM = 50;
