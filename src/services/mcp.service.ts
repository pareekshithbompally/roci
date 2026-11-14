/**
 * MCP Service — thin invoke wrappers over the Rust MCP client
 * (src-tauri/src/mcp/commands.rs). Rust owns connections and the config file;
 * nothing here talks to a server directly.
 */

import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_MCP_SETTINGS } from '@config/mcp.config';
import type { McpConfig, McpServerConfig } from '@config/mcp.config';

/** Mirrors Rust `McpTool`. */
export interface McpTool {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
  server: string;
  /** The server marked this tool destructive (writes, deletes). */
  destructive: boolean;
}

/** Mirrors Rust `McpServerInfo` — what a connected server reports about itself. */
export interface McpServerInfo {
  name: string;
  title: string | null;
  version: string | null;
  /** Icon URL or `data:` URI, when the server offers one. */
  icon: string | null;
  websiteUrl: string | null;
}

/** Mirrors Rust `McpToolOutput`. */
export interface McpToolOutput {
  text: string;
  isError: boolean;
}

export interface McpToolCall {
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
  cancellationToken: string;
}

class McpService {
  /** The config with every settings field present (defaults filled). */
  async getConfig(): Promise<McpConfig> {
    const raw = await invoke<Partial<McpConfig>>('get_mcp_configs');
    return {
      mcpServers: raw.mcpServers ?? {},
      mcpSettings: { ...DEFAULT_MCP_SETTINGS, ...raw.mcpSettings },
    };
  }

  saveConfig(config: McpConfig): Promise<void> {
    return invoke('save_mcp_configs', { configs: JSON.stringify(config) });
  }

  activate(name: string, config: McpServerConfig): Promise<void> {
    return invoke('activate_mcp_server', { name, config });
  }

  deactivate(name: string): Promise<void> {
    return invoke('deactivate_mcp_server', { name });
  }

  getConnectedServers(): Promise<string[]> {
    return invoke<string[]>('get_connected_mcp_servers');
  }

  getServerInfo(): Promise<McpServerInfo[]> {
    return invoke<McpServerInfo[]>('get_mcp_server_info');
  }

  getTools(): Promise<McpTool[]> {
    return invoke<McpTool[]>('get_mcp_tools');
  }

  callTool(call: McpToolCall): Promise<McpToolOutput> {
    return invoke<McpToolOutput>('call_mcp_tool', { ...call });
  }

  cancelToolCall(cancellationToken: string): Promise<void> {
    return invoke('cancel_mcp_tool_call', { cancellationToken });
  }
}

export const mcpService = new McpService();
