/**
 * Pure config transforms behind every MCP panel action. Each returns the
 * next config plus the servers whose connection must follow it — the input
 * to `useMcpReconfigure`.
 */

import { DEFAULT_MCP_SETTINGS } from '@config/mcp.config';
import type { McpConfig, McpServerConfig, McpServers } from '@config/mcp.config';
import type { McpReconfigureVars } from '@features/settings/hooks';
import type { McpServerEntry } from './mcpServerForm';

/**
 * Add or edit servers. Editing one server may rename it in place (order kept);
 * new servers are appended and start enabled unless they say otherwise.
 */
export function upsertServers(config: McpConfig, editingName: string | null, entries: McpServerEntry[]): McpReconfigureVars {
  const servers = config.mcpServers;
  const withActive = ([name, server]: McpServerEntry): McpServerEntry => [
    name,
    { ...server, active: server.active ?? servers[editingName ?? name]?.active ?? true },
  ];
  const resolved = entries.map(withActive);

  const renamed = editingName !== null && resolved.length === 1;
  const mcpServers: McpServers = renamed
    ? Object.fromEntries(Object.entries(servers).map(([k, v]) => (k === editingName ? resolved[0] : [k, v])))
    : { ...servers, ...Object.fromEntries(resolved) };

  const affected = [...(editingName ? [editingName] : []), ...resolved.map(([name]) => name)];
  const mcpSettings = renamed && editingName !== null
    ? { ...config.mcpSettings, trustedServers: renameTrust(config.mcpSettings.trustedServers, editingName, resolved[0][0]) }
    : config.mcpSettings;
  return { next: { mcpServers, mcpSettings }, affected };
}

/** A saved "always allow" follows its server through a rename. */
function renameTrust(trusted: string[], from: string, to: string): string[] {
  return trusted.map((name) => (name === from ? to : name));
}

export function toggleServer(config: McpConfig, name: string, active: boolean): McpReconfigureVars {
  const server = config.mcpServers[name];
  return {
    next: { ...config, mcpServers: { ...config.mcpServers, [name]: { ...server, active } } },
    affected: [name],
  };
}

/** Deleting a server also drops its saved permission, so a later server
 *  under the same name does not inherit the trust. */
export function deleteServer(config: McpConfig, name: string): McpReconfigureVars {
  const { [name]: _removed, ...mcpServers } = config.mcpServers;
  const trustedServers = config.mcpSettings.trustedServers.filter((s) => s !== name);
  return { next: { mcpServers, mcpSettings: { ...config.mcpSettings, trustedServers } }, affected: [name] };
}

export function updateSettings(config: McpConfig, partial: Partial<McpConfig['mcpSettings']>): McpReconfigureVars {
  return { next: { ...config, mcpSettings: { ...config.mcpSettings, ...partial } }, affected: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Apply the JSON editor: one server (`target`) or the whole config. */
export function applyJson(config: McpConfig, parsed: unknown, target: string | null): McpReconfigureVars {
  if (!isRecord(parsed)) throw new Error('Expected a JSON object.');
  if (target !== null) {
    const server = { args: [], env: {}, command: '', ...parsed } as McpServerConfig;
    return {
      next: { ...config, mcpServers: { ...config.mcpServers, [target]: { ...server, active: Boolean(server.active) } } },
      affected: [target],
    };
  }
  const wrapped = 'mcpServers' in parsed || 'mcpSettings' in parsed;
  const mcpServers = (wrapped ? parsed.mcpServers ?? {} : parsed) as McpServers;
  if (!isRecord(mcpServers)) throw new Error('"mcpServers" must be an object.');
  const mcpSettings = wrapped && isRecord(parsed.mcpSettings)
    ? { ...DEFAULT_MCP_SETTINGS, ...parsed.mcpSettings }
    : config.mcpSettings;
  return {
    next: { mcpServers, mcpSettings },
    affected: [...Object.keys(config.mcpServers), ...Object.keys(mcpServers)],
  };
}
