/** MCP defaults, events and limits for the settings panel and tool bridge; Rust owns `mcp_config.json`. */

import type { PlatformCapability } from '@platform/index';
import { AGENT_LOOP_CONFIG } from '@config/chatTools.config';

export type McpTransport = 'stdio' | 'http' | 'sse';

export interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  active?: boolean;
  type?: McpTransport;
  url?: string;
  headers?: Record<string, string>;
  /** HTTP connect timeout, seconds. */
  timeout?: number;
}

export type McpServers = Record<string, McpServerConfig>;

export interface McpSettings {
  toolCallTimeoutSeconds: number;
  /** Per-result character cap applied in Rust; `0` disables it. */
  maxToolOutputChars: number;
  /** Tool calls per chat turn; once reached, chat answers without tools. Counts every chat tool, not only MCP. */
  maxToolCalls: number;
  baseRestartDelayMs: number;
  maxRestartDelayMs: number;
  backoffMultiplier: number;
  /** Run every MCP tool without asking. */
  allowAllTools: boolean;
  /** Servers whose tools run without asking ("Always allow"). */
  trustedServers: string[];
}

export interface McpConfig {
  mcpServers: McpServers;
  mcpSettings: McpSettings;
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  toolCallTimeoutSeconds: 30,
  maxToolOutputChars: 40_000,
  maxToolCalls: AGENT_LOOP_CONFIG.maxToolCalls,
  baseRestartDelayMs: 1_000,
  maxRestartDelayMs: 30_000,
  backoffMultiplier: 2,
  allowAllTools: false,
  trustedServers: [],
};

/** Stable key for one MCP tool in saved preferences (`AppSettings.chatTools`). */
export const mcpToolKey = (server: string, tool: string) => `${server}/${tool}`;

export const MCP_CONFIG = {
  /** Rust → webview: a server connected, disconnected, or reconnected. */
  updateEvent: 'mcp-update',
  /** Directory of public MCP servers, linked from the panel header. */
  directoryUrl: 'https://mcp.so/',
  /** `requires`: the device capability a transport needs (launched programs run only on the Mac). */
  transports: [
    { value: 'stdio', label: 'STDIO', requires: 'canLaunchMcpServers' },
    { value: 'http', label: 'HTTP' },
    { value: 'sse', label: 'SSE' },
  ] as const satisfies ReadonlyArray<{ value: McpTransport; label: string; requires?: PlatformCapability }>,
  /** Bounds for the runtime settings inputs. */
  minToolCallTimeoutSeconds: 1,
  minToolCalls: 1,
  toolOutputCharsStep: 1_000,
  /** Characters of tool arguments shown in the approval prompt. */
  approvalArgsPreviewChars: 400,
  /** Query-string params masked when a server URL is displayed. */
  sensitiveUrlParams: [
    'api_key', 'apikey', 'key', 'token', 'secret', 'password', 'pwd', 'auth',
    'authorization', 'bearer', 'access_token', 'refresh_token', 'client_secret',
    'private_key', 'signature', 'hash',
  ],
  mask: '******',
} as const;
