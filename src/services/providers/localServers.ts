/** Detects local OpenAI-compatible servers (Ollama, LM Studio, vLLM, Jan, any URL) as ordinary `ModelProvider`s. */

import {
  LOCAL_PROVIDER_PREFIX,
  LOCAL_SERVER_DEFAULT_API_KEY,
  LOCAL_SERVER_HOST,
  LOCAL_SERVER_API_PATH,
  LOCAL_LOOPBACK_HOSTS,
  probeTimeoutMs,
  LOCAL_SERVERS,
} from '@config/localServers.config';
import type { LocalServerEntry } from '@config/localServers.config';
import { isLocalProviderId } from '@shared/utils/provider.utils';
import { isEmptyReport, mergeReports } from '@services/ai/models/report';
import type { ListedModel } from '@services/ai/models/report';
import { listModels } from '@services/providers/listers';
import { answers } from '@services/providers/listers/http';
import type { Model, ModelProvider, ProviderSetting } from '@shared/types/modelProviders';

export interface LocalServer {
  id: string;
  baseUrl: string;
  running: boolean;
  models: ListedModel[];
}

/** One row of the Local list: a detected server, a saved provider, or both. */
export interface LocalRow extends LocalServer {
  saved: ModelProvider | null;
}

interface ProbeTarget {
  id: string;
  baseUrl: string;
  /** Known engine whose fingerprint must confirm the id; null for saved/custom targets. */
  entry: LocalServerEntry | null;
}

// ── Ids ─────────────────────────────────────────────────────────

/** `local:<host>:<port>` for a server that isn't one of the known engines. */
export function customServerId(baseUrl: string): string {
  return `${LOCAL_PROVIDER_PREFIX}${new URL(baseUrl).host}`;
}

function knownBaseUrl(entry: LocalServerEntry): string {
  return `http://${LOCAL_SERVER_HOST}:${entry.port}${LOCAL_SERVER_API_PATH}`;
}

/** Where a server is (`http://localhost:9931/v1` → `localhost:9931`), shown under its name. */
export function serverHost(baseUrl: string): string {
  return new URL(baseUrl).host;
}

/** Origin of a base URL (`http://127.0.0.1:11434/v1` → `http://127.0.0.1:11434`). */
function originOf(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

/** A host a server can be at: `localhost`, an IP address, or a name with a dot (a bare word is a typo, not a host). */
function isServerHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.includes('.') || hostname.includes(':') || hostname.startsWith('[');
}

function isLoopback(hostname: string): boolean {
  return LOCAL_LOOPBACK_HOSTS.includes(hostname);
}

/** A plain-http address of another computer: Roci reaches servers elsewhere only over https. */
export function needsHttps(baseUrl: string): boolean {
  const url = new URL(baseUrl);
  return url.protocol === 'http:' && !isLoopback(url.hostname);
}

/** A typed server address as a base URL (`localhost:9000` → `http://localhost:9000/v1`, `my-mac.ts.net` →
 *  `https://my-mac.ts.net/v1`: no scheme means http for this device, https for any other); null if not an address. */
export function normalizeLocalUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const typedScheme = /^https?:\/\//.test(trimmed);
  try {
    const url = new URL(typedScheme ? trimmed : `http://${trimmed}`);
    if (!isServerHost(url.hostname)) return null;
    if (!typedScheme && !isLoopback(url.hostname)) url.protocol = 'https:';
    const path = url.pathname.replace(/\/+$/, '') || LOCAL_SERVER_API_PATH;
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

// ── Probing ─────────────────────────────────────────────────────

/** The models a server at `baseUrl` lists in its own format, or null when nothing answers there. */
export async function listServerModels(id: string, baseUrl: string): Promise<ListedModel[] | null> {
  try {
    return await listModels(id, { baseUrl, signal: AbortSignal.timeout(probeTimeoutMs(baseUrl)) });
  } catch {
    // Refused, timed out or not a model server: nothing to list. Expected, not an error.
    return null;
  }
}

/** True when the engine's own endpoint answers, so the shared port really is this engine. */
async function fingerprintMatches(entry: LocalServerEntry, baseUrl: string): Promise<boolean> {
  if (!entry.fingerprint) return true;
  return answers(`${originOf(baseUrl)}${entry.fingerprint}`, { signal: AbortSignal.timeout(probeTimeoutMs(baseUrl)) });
}

async function probeTarget(target: ProbeTarget): Promise<LocalServer> {
  const models = await listServerModels(target.id, target.baseUrl);
  if (!models) return { id: target.id, baseUrl: target.baseUrl, running: false, models: [] };

  const confirmed = !target.entry || (await fingerprintMatches(target.entry, target.baseUrl));
  const id = confirmed ? target.id : customServerId(target.baseUrl);
  return { id, baseUrl: target.baseUrl, running: true, models };
}

/** Saved servers are probed at their own URL; `scanThisDevice` adds known engines not yet saved, at their default port. */
function probeTargets(saved: ModelProvider[], scanThisDevice: boolean): ProbeTarget[] {
  const savedTargets = saved.map((p) => ({ id: p.provider, baseUrl: getBaseUrl(p), entry: null }));
  const savedIds = new Set(saved.map((p) => p.provider));
  const savedOrigins = new Set(savedTargets.map((t) => originOf(t.baseUrl)));
  if (!scanThisDevice) return savedTargets;
  const knownTargets = LOCAL_SERVERS
    .filter((entry) => !savedIds.has(entry.id) && !savedOrigins.has(originOf(knownBaseUrl(entry))))
    .map((entry) => ({ id: entry.id, baseUrl: knownBaseUrl(entry), entry }));
  return [...savedTargets, ...knownTargets];
}

/** Stable query-key parts for the saved providers detection depends on (`id url`). */
export function savedTargetKeys(saved: ModelProvider[]): string[] {
  return saved.map((p) => `${p.provider} ${getBaseUrl(p)}`);
}

/** Probe every saved server and, on a device that runs servers itself, every known port, in parallel. */
export async function detectLocalServers(saved: ModelProvider[], scanThisDevice: boolean): Promise<LocalServer[]> {
  return Promise.all(probeTargets(saved, scanThisDevice).map(probeTarget));
}

// ── Providers ───────────────────────────────────────────────────

function getBaseUrl(provider: ModelProvider): string {
  const setting = provider.settings.find((s) => s.key === 'base-url');
  return (setting?.controller_props.value as string) || provider.base_url || '';
}

function localProviderSettings(baseUrl: string): ProviderSetting[] {
  return [
    {
      key: 'api-key',
      title: 'API Key',
      description: 'Local servers ignore this unless started with a key. Replace it if yours requires one.',
      controller_type: 'input',
      controller_props: {
        placeholder: LOCAL_SERVER_DEFAULT_API_KEY,
        value: LOCAL_SERVER_DEFAULT_API_KEY,
        type: 'password',
        input_actions: ['unobscure', 'copy'],
      },
    },
    {
      key: 'base-url',
      title: 'Base URL',
      description: 'OpenAI-compatible endpoint of the server on this Mac.',
      controller_type: 'input',
      controller_props: { placeholder: baseUrl, value: baseUrl },
    },
  ];
}

/** The provider saved when the user switches a detected server on, named as `serverApp` when its format proved one. */
export function toLocalProvider(server: LocalServer, serverApp?: string): ModelProvider {
  return {
    ...(serverApp && { server_app: serverApp }),
    active: true,
    provider: server.id,
    api_key: LOCAL_SERVER_DEFAULT_API_KEY,
    base_url: server.baseUrl,
    settings: localProviderSettings(server.baseUrl),
    models: syncModels([], server.models),
  };
}

/** Keep served models with the user's own choices (rename, overrides), refresh what the server reports, add new, drop the rest. */
export function syncModels(existing: Model[], listed: ListedModel[]): Model[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  return listed.map(({ id, report }) => {
    const saved = byId.get(id) ?? { id, name: id };
    return isEmptyReport(report) ? saved : { ...saved, reported: mergeReports(saved.reported, report) };
  });
}

/** Detected servers merged with saved local providers. Not-running servers show only when saved. */
export function localRows(servers: LocalServer[], providers: ModelProvider[]): LocalRow[] {
  const savedById = new Map(providers.filter((p) => isLocalProviderId(p.provider)).map((p) => [p.provider, p]));
  return servers
    .map((server) => ({ ...server, saved: savedById.get(server.id) ?? null }))
    .filter((row) => row.running || row.saved);
}

export function savedLocalProviders(providers: ModelProvider[]): ModelProvider[] {
  return providers.filter((p) => isLocalProviderId(p.provider));
}
