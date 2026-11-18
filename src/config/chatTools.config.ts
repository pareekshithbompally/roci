/** Composer Tools picker defaults for which tools chat may use. */

import type { ChatToolPreferences } from '@shared/types';

export const DEFAULT_CHAT_TOOLS: ChatToolPreferences = {
  meetingTools: true,
  imageGeneration: true,
  disabledMcpTools: [],
};

export const CHAT_TOOLS_CONFIG = {
  /** Label of the built-in tool group in the picker. */
  meetingGroupLabel: 'Meetings & chats',
} as const;

export const AGENT_LOOP_CONFIG = {
  /** Tool calls per chat turn before chat must answer in text; most turns need 1–3.
   *  The default for Settings › MCP › Max tool calls per turn (`McpSettings.maxToolCalls`), which is what chat enforces. */
  maxToolCalls: 10,
} as const;
