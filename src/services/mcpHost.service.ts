/** Invoke wrappers over Kasset's own MCP server; Rust owns the socket and the coding agents' config files. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

/** Rust `host::CALL_EVENT` / `STATUS_EVENT`. */
const CALL_EVENT = 'mcp-host://call';
const STATUS_EVENT = 'mcp-host://status';

/** A tool in MCP's wire shape (`tools/list`). */
export interface McpWireTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
}

/** Rust `ToolCallRequest`: one call from an agent. */
export interface McpHostCall {
  id: number;
  name: string;
  arguments: Record<string, unknown>;
}

/** Rust `ServerOverview`. */
export interface McpHostStatus {
  listening: boolean;
  /** Kasset's tools are loaded: calls run at once. */
  ready: boolean;
  /** Agents connected right now. */
  clients: number;
  error: string | null;
  /** What any agent's config launches: `command args…` (stdio). */
  command: string | null;
  args: string[];
}

export type CodingAgentId = 'claude-code' | 'codex' | 'opencode';

/** Rust `agents::AgentStatus`. */
export interface CodingAgentStatus {
  id: CodingAgentId;
  installed: boolean;
  /** `outdated`: registered for a Kasset that has moved — add again to fix. */
  registration: 'none' | 'current' | 'outdated';
  configPath: string;
  /** The config can't be read, so Kasset won't edit it. */
  problem: string | null;
}

export const mcpHostService = {
  publishTools: (tools: McpWireTool[]): Promise<void> => invoke('mcp_host_publish_tools', { tools }),

  reply: (id: number, text: string, isError: boolean): Promise<void> =>
    invoke('mcp_host_reply', { id, reply: { text, isError } }),

  onCall: (handler: (call: McpHostCall) => void): Promise<UnlistenFn> =>
    listen<McpHostCall>(CALL_EVENT, (event) => handler(event.payload)),

  onStatus: (handler: () => void): Promise<UnlistenFn> => listen(STATUS_EVENT, handler),

  status: (): Promise<McpHostStatus> => invoke<McpHostStatus>('mcp_host_status'),

  agents: (): Promise<CodingAgentStatus[]> => invoke<CodingAgentStatus[]>('coding_agents_status'),

  setAgent: (id: CodingAgentId, registered: boolean): Promise<CodingAgentStatus> =>
    invoke<CodingAgentStatus>('coding_agent_set', { id, registered }),
};
