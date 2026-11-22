/** Composer Tools picker defaults for which tools chat may use. */

import type { AppSettings, ChatToolPreferences } from '@shared/types';

/** Every tool on until the user turns it off; each switch is saved. */
export const DEFAULT_CHAT_TOOLS: ChatToolPreferences = {
  meetingTools: true,
  imageGeneration: true,
  resultViews: true,
  webSearch: true,
  disabledMcpTools: [],
};

/** The saved tool choices over the defaults: what the Tools picker shows and what chat sends. */
export const chatToolPreferences = (settings: Pick<AppSettings, 'chatTools'>): ChatToolPreferences => ({
  ...DEFAULT_CHAT_TOOLS,
  ...settings.chatTools,
});

export const CHAT_TOOLS_CONFIG = {
  /** Label of the built-in tool group in the picker. */
  meetingGroupLabel: 'Meetings & chats',
} as const;

export const AGENT_LOOP_CONFIG = {
  /** Tool calls per chat turn before chat must answer in text; most turns need 1–3.
   *  The default for Settings › MCP › Max tool calls per turn (`McpSettings.maxToolCalls`), which is what chat enforces. */
  maxToolCalls: 10,
} as const;

/** The Mac Tools menu's words: kept short so every row stays one tight title over a grey line. */
export const TOOLS_MENU_COPY = {
  builtInHeader: 'Built-in',
  mcpHeader: 'MCP servers',
  webSearch: 'Web search',
  imageGeneration: 'Image generation',
  resultViews: 'Charts & tables',
  resultViewsHint: 'Figures drawn in the chat',
  via: (name: string) => `via ${name}`,
  notForModel: 'Not available for this model',
  chooseImageModel: 'Choose an image model…',
  cantUseTools: (model: string) => `${model} can’t use tools`,
  pickToolModel: 'Pick a model with tool calling',
  toolCount: (n: number) => `${n} ${n === 1 ? 'tool' : 'tools'}`,
  onOf: (on: number, total: number) => `${on} of ${total} on`,
  /** A server's own switch, first in its fan-out: it turns all of that server's tools on or off. */
  allTools: 'All tools',
  /** What switched-on tools add to each message (an estimate, already formatted). */
  tokensEach: (tokens: string) => `≈${tokens} tokens each message`,
  writes: 'Writes',
  connecting: 'Connecting…',
  noTools: 'No tools',
  addServer: 'Add MCP server…',
  addServerHint: 'Files, browsers, APIs',
  noConnected: 'No connected servers',
  manage: 'Manage MCP servers…',
  ask: 'Ask before running MCP tools',
} as const;
