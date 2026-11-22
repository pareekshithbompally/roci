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
  /** `requires`: the device capability a transport needs (launched programs run only on the Mac). */
  transports: [
    { value: 'stdio', label: 'STDIO', requires: 'canLaunchMcpServers' },
    { value: 'http', label: 'HTTP' },
    { value: 'sse', label: 'SSE' },
  ] as const satisfies ReadonlyArray<{ value: McpTransport; label: string; requires?: PlatformCapability }>,
  /** Fewest tool calls a turn may allow, however `mcp_config.json` was edited. */
  minToolCalls: 1,
  /** Choices in Settings › MCP › Limits; a saved value that isn't one shows as its own choice. */
  limitChoices: {
    toolCallTimeoutSeconds: {
      values: [10, 30, 60, 120, 300],
      label: (s: number) => (s < 60 ? `${s} seconds` : s === 60 ? '1 minute' : `${s / 60} minutes`),
    },
    maxToolCalls: {
      values: [3, 5, 10, 20, 50],
      label: (n: number) => `${n} call${n === 1 ? '' : 's'}`,
    },
    maxToolOutputChars: {
      values: [2_000, 4_000, 10_000, 40_000, 0],
      label: (n: number) => (n === 0 ? 'No limit' : `${n.toLocaleString()} characters`),
    },
  },
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

/** MCP App screens in chat: their frame, and Roci's tokens under the theme variable names the MCP Apps spec defines. */
export const MCP_APP_CONFIG = {
  /** Height before a screen reports its own, and the most it may take (it scrolls beyond). */
  initialHeight: 120,
  maxHeight: 640,
  /** Each screen has its own origin, so `allow-same-origin` keeps it there (its own storage), never in Roci's. */
  sandbox: 'allow-scripts allow-same-origin allow-forms',
  styleVariables: {
    '--color-background-primary': '--bg-base',
    '--color-background-secondary': '--bg-layer-1',
    '--color-background-tertiary': '--bg-layer-2',
    '--color-background-inverse': '--bg-inverse',
    '--color-background-ghost': '--bg-hover',
    '--color-background-info': '--info-bg',
    '--color-background-danger': '--danger-bg',
    '--color-background-success': '--success-bg',
    '--color-background-warning': '--warning-bg',
    '--color-text-primary': '--text-primary',
    '--color-text-secondary': '--text-muted',
    '--color-text-tertiary': '--text-faint',
    '--color-text-inverse': '--text-inverse',
    '--color-text-info': '--info-fg',
    '--color-text-danger': '--danger-fg',
    '--color-text-success': '--success-fg',
    '--color-text-warning': '--warning-fg',
    '--color-border-primary': '--border-base',
    '--color-border-secondary': '--border-muted',
    '--color-border-info': '--info-border',
    '--color-border-danger': '--danger-border',
    '--color-border-success': '--success-border',
    '--color-border-warning': '--warning-border',
    '--color-ring-primary': '--border-focus',
    '--border-radius-lg': '--radius-card',
    '--shadow-md': '--shadow-raised',
    '--shadow-lg': '--shadow-overlay',
  },
  copy: {
    openLinkTitle: (server: string) => `${server} wants to open a link`,
    openLink: 'Open',
  },
  /** Body text sizes by the spec's steps (sent as `--font-text-<step>-size`). */
  textSizes: { xs: '--fs-subheadline', sm: '--fs-callout', md: '--fs-body', lg: '--fs-reading' },
} as const;
