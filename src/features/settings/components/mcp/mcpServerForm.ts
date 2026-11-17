/** Pure MCP form helpers: config ⇄ form state, validation, JSON entry parsing, and secret masking. */

import { MCP_CONFIG } from '@config/mcp.config';
import { isRecord } from '@shared/utils/validators';
import type { McpServerConfig, McpTransport } from '@config/mcp.config';
import { pairsToRecord } from '@features/settings/components/shared';
import type { KeyValuePair } from '@features/settings/components/shared';
import { platform } from '@platform/index';

export interface McpServerForm {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: KeyValuePair[];
  url: string;
  headers: KeyValuePair[];
  timeout: string;
}

export type McpServerEntry = [name: string, config: McpServerConfig];

/** The transports this device can connect over (launched programs only on the Mac). */
export const DEVICE_TRANSPORTS = MCP_CONFIG.transports.filter((t) => !('requires' in t) || platform[t.requires]);

export const EMPTY_FORM: McpServerForm = {
  name: '',
  transport: DEVICE_TRANSPORTS[0].value,
  command: '',
  args: [],
  env: [],
  url: '',
  headers: [],
  timeout: '',
};

export function formFromConfig(name: string, config: McpServerConfig): McpServerForm {
  return {
    name,
    transport: config.type ?? 'stdio',
    command: config.command ?? '',
    args: config.args ?? [],
    env: Object.entries(config.env ?? {}),
    url: config.url ?? '',
    headers: Object.entries(config.headers ?? {}),
    timeout: config.timeout ? String(config.timeout) : '',
  };
}

/** Build the config, keeping unknown fields (and `active`) of the edited entry. */
export function configFromForm(form: McpServerForm, base?: McpServerConfig): McpServerConfig {
  if (form.transport === 'stdio') {
    return {
      ...base,
      type: 'stdio',
      command: form.command.trim(),
      args: form.args.map((a) => a.trim()).filter(Boolean),
      env: pairsToRecord(form.env),
      url: undefined,
      headers: undefined,
      timeout: undefined,
    };
  }
  const headers = pairsToRecord(form.headers);
  const timeout = Number.parseInt(form.timeout, 10);
  return {
    ...base,
    type: form.transport,
    command: '',
    args: [],
    env: {},
    url: form.url.trim(),
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
  };
}

/** First problem with the form, or null when it can be saved. */
export function validateForm(form: McpServerForm): string | null {
  if (!form.name.trim()) return 'Enter a server name.';
  if (form.transport === 'stdio' && !form.command.trim()) return 'Enter the command that starts the server.';
  if (form.transport !== 'stdio' && !form.url.trim()) return 'Enter the server URL.';
  return null;
}

const TRANSPORTS: readonly string[] = MCP_CONFIG.transports.map((t) => t.value);

/** Parse `{ "<name>": { command|url, ... } }` (optionally wrapped in `mcpServers`); throws a readable Error. */
export function parseServerEntries(text: string): McpServerEntry[] {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error('Expected a JSON object of servers.');
  const servers = isRecord(parsed.mcpServers) ? parsed.mcpServers : parsed;
  if ('command' in servers || 'url' in servers) {
    throw new Error('Wrap the config in its server name: { "my-server": { "command": … } }');
  }
  return Object.entries(servers).map(([rawName, value]) => {
    const name = rawName.trim();
    if (!name) throw new Error('Every server needs a non-empty name.');
    if (!isRecord(value)) throw new Error(`"${name}" must be an object.`);
    const type = value.type;
    if (type !== undefined && !TRANSPORTS.includes(String(type))) {
      throw new Error(`"${name}" has unknown type "${String(type)}" (use stdio, http, or sse).`);
    }
    return [name, { args: [], env: {}, command: '', ...value } as McpServerConfig];
  });
}

// ── Card status ──

/** Row status; `offline` means enabled but Rust holds no connection (failed at launch, or reconnecting). */
export type McpServerStatus = 'connected' | 'connecting' | 'stopping' | 'offline' | 'off';

export function serverStatus(active: boolean, connected: boolean, pending: boolean): McpServerStatus {
  if (pending) return active ? 'connecting' : 'stopping';
  if (!active) return 'off';
  return connected ? 'connected' : 'offline';
}

// ── Display masking ──

export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const sensitive = new Set<string>(MCP_CONFIG.sensitiveUrlParams);
    for (const key of [...parsed.searchParams.keys()]) {
      if (sensitive.has(key.toLowerCase())) parsed.searchParams.set(key, MCP_CONFIG.mask);
    }
    return parsed.toString();
  } catch {
    const query = url.indexOf('?');
    return query === -1 ? url : `${url.slice(0, query + 1)}${MCP_CONFIG.mask}`;
  }
}
