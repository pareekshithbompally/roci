/**
 * MCP (Model Context Protocol) configuration — single source of truth for
 * defaults, events, and limits used by the MCP settings panel and tool bridge.
 *
 * Shapes mirror Jan's `mcp_config.json` (Rust owns the file; see
 * src-tauri/src/mcp/config.rs).
 */

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
  transports: [
    { value: 'stdio', label: 'STDIO' },
    { value: 'http', label: 'HTTP' },
    { value: 'sse', label: 'SSE' },
  ] as const satisfies ReadonlyArray<{ value: McpTransport; label: string }>,
  /** Bounds for the runtime settings inputs. */
  minToolCallTimeoutSeconds: 1,
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
