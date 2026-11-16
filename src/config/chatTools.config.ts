/** Composer Tools picker defaults for which tools chat may use. */

import type { ChatToolPreferences } from '@shared/types';

export const DEFAULT_CHAT_TOOLS: ChatToolPreferences = {
  meetingTools: true,
  disabledMcpTools: [],
};

export const CHAT_TOOLS_CONFIG = {
  /** Label of the built-in tool group in the picker. */
  meetingGroupLabel: 'Meetings & chats',
} as const;

export const AGENT_LOOP_CONFIG = {
  /** Model calls per chat reply; the last one must answer in text. Most replies need 1–3 tool calls. */
  maxSteps: 10,
} as const;
