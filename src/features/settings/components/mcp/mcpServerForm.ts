/** Pure MCP form helpers: config ⇄ form state, validation, JSON entry parsing, and secret masking. */

import { MCP_CONFIG, MCP_COPY } from '@config/mcp.config';
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
  /** Seconds; empty leaves it to Roci. */
  timeout: string;
  /** Its tools run without asking. */
  alwaysAllow: boolean;
  /** Its screens may run advanced code. */
  allowScreenCode: boolean;
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
  alwaysAllow: false,
  allowScreenCode: false,
};

export function formFromConfig(name: string, config: McpServerConfig, alwaysAllow: boolean): McpServerForm {
  return {
    name,
    transport: config.type ?? 'stdio',
    command: config.command ?? '',
    args: config.args ?? [],
    env: Object.entries(config.env ?? {}),
    url: config.url ?? '',
    headers: Object.entries(config.headers ?? {}),
    timeout: config.timeout ? String(config.timeout) : '',
    alwaysAllow,
    allowScreenCode: !!config.allowScreenCode,
  };
}

/** Build the config, keeping unknown fields (and `active`) of the edited entry. */
export function configFromForm(form: McpServerForm, base?: McpServerConfig): McpServerConfig {
  const kept = { ...base, allowScreenCode: form.allowScreenCode || undefined };
  if (form.transport === 'stdio') {
    return {
      ...kept,
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
    ...kept,
    type: form.transport,
    command: '',
    args: [],
    env: {},
    url: form.url.trim(),
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
  };
}

/** The form has what a server needs: a name, and its command or address. */
export function isComplete(form: McpServerForm): boolean {
  const reach = form.transport === 'stdio' ? form.command : form.url;
  return form.name.trim() !== '' && reach.trim() !== '';
}

/** The connect timeout's choices, with the saved one in order when it isn't one of them. */
export function connectTimeoutOptions(current: string) {
  const { defaultValue, defaultLabel, values } = MCP_CONFIG.connectTimeout;
  const seconds = [...new Set<number>([...values, ...(current ? [Number(current)] : [])])].sort((a, b) => a - b);
  return [
    { value: defaultValue, label: defaultLabel },
    ...seconds.map((s) => ({ value: String(s), label: MCP_CONFIG.limitChoices.toolCallTimeoutSeconds.label(s) })),
  ];
}

const TRANSPORTS: readonly string[] = MCP_CONFIG.transports.map((t) => t.value);

/** Parse `{ "<name>": { command|url, ... } }` (optionally wrapped in `mcpServers`); throws a readable Error. */
export function parseServerEntries(text: string): McpServerEntry[] {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error(MCP_COPY.json.notObject);
  return serverEntries(isRecord(parsed.mcpServers) ? parsed.mcpServers : parsed);
}

/** Checks each server of a `{ "<name>": {…} }` object; one given by its address alone is a remote (HTTP) server. */
export function serverEntries(servers: Record<string, unknown>): McpServerEntry[] {
  if ('command' in servers || 'url' in servers) {
    throw new Error(MCP_COPY.json.unwrapped);
  }
  return Object.entries(servers).map(([rawName, value]) => {
    const name = rawName.trim();
    if (!name) throw new Error(MCP_COPY.json.noName);
    if (!isRecord(value)) throw new Error(MCP_COPY.json.notServer(name));
    const type = value.type;
    if (type !== undefined && !TRANSPORTS.includes(String(type))) {
      throw new Error(MCP_COPY.json.unknownType(name, String(type)));
    }
    const remote = type === undefined && typeof value.url === 'string' && !value.command;
    return [name, { args: [], env: {}, command: '', ...(remote && { type: 'http' }), ...value } as McpServerConfig];
  });
}

// ── Card status ──

/** Row status. `noNetwork`: on but unconnected while the device is offline (it connects by itself when the network is
 *  back); `notConnected`: on but unconnected with the network up (it failed, or is reconnecting). */
export type McpServerStatus = 'connected' | 'connecting' | 'stopping' | 'noNetwork' | 'notConnected' | 'off';

interface ServerState {
  /** Turned on. */
  active: boolean;
  /** The app holds a live connection. */
  connected: boolean;
  /** A change to it is being applied. */
  pending: boolean;
  /** The device is online (networkStore). */
  online: boolean;
}

export function serverStatus({ active, connected, pending, online }: ServerState): McpServerStatus {
  if (pending) return active ? 'connecting' : 'stopping';
  if (!active) return 'off';
  if (connected) return 'connected';
  return online ? 'notConnected' : 'noNetwork';
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
