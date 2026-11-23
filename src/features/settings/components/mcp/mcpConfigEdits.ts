/** Pure MCP config transforms; each returns the next config plus servers to reconnect, for `useMcpReconfigure`. */

import { DEFAULT_MCP_SETTINGS } from '@config/mcp.config';
import { isRecord } from '@shared/utils/validators';
import type { McpConfig, McpServers } from '@config/mcp.config';
import type { McpReconfigureVars } from '@features/settings/hooks';
import { serverEntries, type McpServerEntry } from './mcpServerForm';

/** Add or edit servers; an edit may rename in place, new servers append and start enabled unless stated. */
export function upsertServers(config: McpConfig, editingName: string | null, entries: McpServerEntry[]): McpReconfigureVars {
  const servers = config.mcpServers;
  const withActive = ([name, server]: McpServerEntry): McpServerEntry => [
    name,
    // A new server starts on (and tries to connect), even after a first attempt that failed saved it off.
    { ...server, active: server.active ?? (editingName === null ? true : servers[editingName]?.active ?? true) },
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

/** The trusted servers with `name` added (always allow) or removed (ask first). */
function withTrust(trusted: string[], name: string, allowed: boolean): string[] {
  return allowed ? [...new Set([...trusted, name])] : trusted.filter((s) => s !== name);
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

/** One server's "always allow" set or cleared, on top of another edit. */
export function setTrust(vars: McpReconfigureVars, name: string, allowed: boolean): McpReconfigureVars {
  const { mcpSettings } = vars.next;
  const trustedServers = withTrust(mcpSettings.trustedServers, name, allowed);
  return { ...vars, next: { ...vars.next, mcpSettings: { ...mcpSettings, trustedServers } } };
}

/** Also drops the server's saved permission, so a later server with the same name doesn't inherit trust. */
export function deleteServer(config: McpConfig, name: string): McpReconfigureVars {
  const { [name]: _removed, ...mcpServers } = config.mcpServers;
  const trustedServers = withTrust(config.mcpSettings.trustedServers, name, false);
  return { next: { mcpServers, mcpSettings: { ...config.mcpSettings, trustedServers } }, affected: [name] };
}

export function updateSettings(config: McpConfig, partial: Partial<McpConfig['mcpSettings']>): McpReconfigureVars {
  return { next: { ...config, mcpSettings: { ...config.mcpSettings, ...partial } }, affected: [] };
}

/** A value as text with every object's keys in order, so two configs compare by content, not by how they were written. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value) ?? '';
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

/** Servers added, removed, or edited between two configs. */
function changedServers(before: McpServers, after: McpServers): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((name) => canonical(before[name]) !== canonical(after[name]));
}

/** Apply the whole-config JSON; only changed servers reconnect, so saving untouched JSON restarts nothing. */
export function applyJson(config: McpConfig, parsed: unknown): McpReconfigureVars {
  if (!isRecord(parsed)) throw new Error('Expected a JSON object.');
  const wrapped = 'mcpServers' in parsed || 'mcpSettings' in parsed;
  // Settings alone leave the servers as they are; servers are checked one by one, as a pasted server is.
  const raw = wrapped ? parsed.mcpServers : parsed;
  if (raw !== undefined && !isRecord(raw)) throw new Error('"mcpServers" must be an object.');
  const mcpServers: McpServers = raw === undefined ? config.mcpServers : Object.fromEntries(serverEntries(raw as Record<string, unknown>));
  const mcpSettings = wrapped && isRecord(parsed.mcpSettings)
    ? { ...DEFAULT_MCP_SETTINGS, ...parsed.mcpSettings }
    : config.mcpSettings;
  return { next: { mcpServers, mcpSettings }, affected: changedServers(config.mcpServers, mcpServers) };
}
