/** Pure MCP config transforms; each returns the next config plus servers to reconnect, for `useMcpReconfigure`. */

import { DEFAULT_MCP_SETTINGS } from '@config/mcp.config';
import type { McpConfig, McpServers } from '@config/mcp.config';
import type { McpReconfigureVars } from '@features/settings/hooks';
import type { McpServerEntry } from './mcpServerForm';

/** Add or edit servers; an edit may rename in place, new servers append and start enabled unless stated. */
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

/** Also drops the server's saved permission, so a later server with the same name doesn't inherit trust. */
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

/** Servers added, removed, or edited between two configs. */
function changedServers(before: McpServers, after: McpServers): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
}

/** Apply the whole-config JSON; only changed servers reconnect, so saving untouched JSON restarts nothing. */
export function applyJson(config: McpConfig, parsed: unknown): McpReconfigureVars {
  if (!isRecord(parsed)) throw new Error('Expected a JSON object.');
  const wrapped = 'mcpServers' in parsed || 'mcpSettings' in parsed;
  const mcpServers = (wrapped ? parsed.mcpServers ?? {} : parsed) as McpServers;
  if (!isRecord(mcpServers)) throw new Error('"mcpServers" must be an object.');
  const mcpSettings = wrapped && isRecord(parsed.mcpSettings)
    ? { ...DEFAULT_MCP_SETTINGS, ...parsed.mcpSettings }
    : config.mcpSettings;
  return { next: { mcpServers, mcpSettings }, affected: changedServers(config.mcpServers, mcpServers) };
}
