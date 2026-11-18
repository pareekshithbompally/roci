/** View model for the Tools picker: built-in group plus one group per MCP server, with enabled counts. */

import { mcpToolKey } from '@config/mcp.config';
import type { McpServers } from '@config/mcp.config';
import type { McpTool } from '@services/mcp.service';
import type { ChatToolPreferences } from '@shared/types';

export type ToolGroupStatus = 'builtin' | 'connected' | 'connecting' | 'off';

export interface CatalogTool {
  /** Preference key (`mcpToolKey`) for MCP tools; the tool name for built-ins. */
  key: string;
  name: string;
  description: string | null;
  destructive: boolean;
  enabled: boolean;
}

export interface CatalogGroup {
  key: string;
  label: string;
  status: ToolGroupStatus;
  /** Tools switch one by one (MCP) or only as a group (built-ins). */
  perTool: boolean;
  /** The server's own icon (MCP `serverInfo.icons`); null for built-ins or none offered. */
  icon: string | null;
  tools: CatalogTool[];
  enabledCount: number;
}

export interface CatalogInput {
  builtInNames: string[];
  builtInLabel: string;
  servers: McpServers;
  connected: string[];
  mcpTools: McpTool[];
  prefs: ChatToolPreferences;
  /** Server icons by name (connected servers only). */
  serverIcons?: ReadonlyMap<string, string | null>;
}

function withCount(group: Omit<CatalogGroup, 'enabledCount'>): CatalogGroup {
  return { ...group, enabledCount: group.tools.filter((t) => t.enabled).length };
}

function builtInGroup({ builtInNames, builtInLabel, prefs }: CatalogInput): CatalogGroup {
  return withCount({
    key: 'builtin',
    label: builtInLabel,
    status: 'builtin',
    perTool: false,
    icon: null,
    tools: builtInNames.map((name) => ({
      key: name,
      name,
      description: null,
      destructive: false,
      enabled: prefs.meetingTools,
    })),
  });
}

function serverStatus(name: string, active: boolean | undefined, connected: Set<string>): ToolGroupStatus {
  if (connected.has(name)) return 'connected';
  return active ? 'connecting' : 'off';
}

function mcpGroups({ servers, connected, mcpTools, prefs, serverIcons }: CatalogInput): CatalogGroup[] {
  const live = new Set(connected);
  const disabled = new Set(prefs.disabledMcpTools);
  return Object.entries(servers).map(([server, config]) =>
    withCount({
      key: `mcp:${server}`,
      label: server,
      status: serverStatus(server, config.active, live),
      perTool: true,
      icon: serverIcons?.get(server) ?? null,
      tools: mcpTools
        .filter((tool) => tool.server === server)
        .map((tool) => {
          const key = mcpToolKey(server, tool.name);
          return { key, name: tool.name, description: tool.description, destructive: tool.destructive, enabled: !disabled.has(key) };
        }),
    }),
  );
}

export function buildCatalog(input: CatalogInput): { builtIn: CatalogGroup; servers: CatalogGroup[] } {
  return { builtIn: builtInGroup(input), servers: mcpGroups(input) };
}

/** Tools the model will actually get: enabled tools of the built-in group and connected servers. */
export function countEnabled(groups: CatalogGroup[]): number {
  return groups
    .filter((g) => g.status === 'builtin' || g.status === 'connected')
    .reduce((sum, g) => sum + g.enabledCount, 0);
}

/** Next `disabledMcpTools` after switching `keys` on or off. */
/** Several switches changed together (a native menu reports them as it closes); unset fields stay as they are. */
export interface ToolSwitches {
  webSearch?: boolean;
  imageGeneration?: boolean;
  meetingTools?: boolean;
  /** MCP tool key → on. */
  mcpTools?: Record<string, boolean>;
}

/** The saved preferences with `changes` applied: one write, so no switch overwrites another. */
export function withSwitches(prefs: ChatToolPreferences, changes: ToolSwitches): ChatToolPreferences {
  const disabledMcpTools = Object.entries(changes.mcpTools ?? {})
    .reduce((disabled, [key, on]) => setToolsEnabled(disabled, [key], on), prefs.disabledMcpTools);
  return {
    ...prefs,
    webSearch: changes.webSearch ?? prefs.webSearch,
    imageGeneration: changes.imageGeneration ?? prefs.imageGeneration,
    meetingTools: changes.meetingTools ?? prefs.meetingTools,
    disabledMcpTools,
  };
}

export function setToolsEnabled(disabled: string[], keys: string[], enabled: boolean): string[] {
  const next = new Set(disabled);
  for (const key of keys) {
    if (enabled) next.delete(key);
    else next.add(key);
  }
  return [...next];
}
