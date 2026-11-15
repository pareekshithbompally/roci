/** Detects local OpenAI-compatible servers (Ollama, LM Studio, vLLM, Jan, any URL) as ordinary `ModelProvider`s. */

import { getPlatformFetch } from '@services/platform-fetch';
import {
  LOCAL_PROVIDER_PREFIX,
  LOCAL_SERVER_DEFAULT_API_KEY,
  LOCAL_SERVER_HOST,
  LOCAL_SERVER_API_PATH,
  LOCAL_PROBE_TIMEOUT_MS,
  LOCAL_SERVERS,
} from '@config/localServers.config';
import type { LocalServerEntry } from '@config/localServers.config';
import { isLocalProviderId } from '@shared/utils/provider.utils';
import type { Model, ModelProvider, ProviderSetting } from '@shared/types/modelProviders';

export interface LocalServer {
  id: string;
  baseUrl: string;
  running: boolean;
  modelIds: string[];
}

/** One row of the Local list: a detected server, a saved provider, or both. */
export interface LocalRow {
  id: string;
  baseUrl: string;
  running: boolean;
  modelIds: string[];
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

/** Origin of a base URL (`http://127.0.0.1:11434/v1` → `http://127.0.0.1:11434`). */
function originOf(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

/** A typed server address as a base URL (`localhost:9000` → `http://localhost:9000/v1`); null if not a URL. */
export function normalizeLocalUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const path = url.pathname.replace(/\/+$/, '') || LOCAL_SERVER_API_PATH;
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

// ── Probing ─────────────────────────────────────────────────────

async function getWithTimeout(url: string): Promise<Response | null> {
  try {
    return await getPlatformFetch()(url, { signal: AbortSignal.timeout(LOCAL_PROBE_TIMEOUT_MS) });
  } catch {
    // Refused or timed out: nothing is listening. Expected, not an error.
    return null;
  }
}

/** Model ids served at `{baseUrl}/models`, or null when no OpenAI-compatible server answers. */
export async function probeModels(baseUrl: string): Promise<string[] | null> {
  const response = await getWithTimeout(`${baseUrl.replace(/\/$/, '')}/models`);
  if (!response?.ok) return null;
  try {
    const body: unknown = await response.json();
    const data = (body as { data?: Array<{ id?: unknown }> }).data;
    if (!Array.isArray(data)) return null;
    return data.map((m) => m.id).filter((id): id is string => typeof id === 'string');
  } catch {
    return null;
  }
}

/** True when the engine's own endpoint answers, so the shared port really is this engine. */
async function fingerprintMatches(entry: LocalServerEntry, baseUrl: string): Promise<boolean> {
  if (!entry.fingerprint) return true;
  const response = await getWithTimeout(`${originOf(baseUrl)}${entry.fingerprint}`);
  return !!response?.ok;
}

async function probeTarget(target: ProbeTarget): Promise<LocalServer> {
  const modelIds = await probeModels(target.baseUrl);
  if (!modelIds) return { id: target.id, baseUrl: target.baseUrl, running: false, modelIds: [] };

  const confirmed = !target.entry || (await fingerprintMatches(target.entry, target.baseUrl));
  const id = confirmed ? target.id : customServerId(target.baseUrl);
  return { id, baseUrl: target.baseUrl, running: true, modelIds };
}

/** Saved local providers are probed at their own URL; known engines not yet saved at their default port. */
function probeTargets(saved: ModelProvider[]): ProbeTarget[] {
  const savedTargets = saved.map((p) => ({ id: p.provider, baseUrl: getBaseUrl(p), entry: null }));
  const savedIds = new Set(saved.map((p) => p.provider));
  const savedOrigins = new Set(savedTargets.map((t) => originOf(t.baseUrl)));
  const knownTargets = LOCAL_SERVERS
    .filter((entry) => !savedIds.has(entry.id) && !savedOrigins.has(originOf(knownBaseUrl(entry))))
    .map((entry) => ({ id: entry.id, baseUrl: knownBaseUrl(entry), entry }));
  return [...savedTargets, ...knownTargets];
}

/** Stable query-key parts for the saved providers detection depends on (`id url`). */
export function savedTargetKeys(saved: ModelProvider[]): string[] {
  return saved.map((p) => `${p.provider} ${getBaseUrl(p)}`);
}

/** Probe every known port and every saved local provider in parallel. */
export async function detectLocalServers(saved: ModelProvider[]): Promise<LocalServer[]> {
  return Promise.all(probeTargets(saved).map(probeTarget));
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

/** The provider saved when the user switches a detected server on. */
export function toLocalProvider(server: LocalServer): ModelProvider {
  return {
    active: true,
    provider: server.id,
    api_key: LOCAL_SERVER_DEFAULT_API_KEY,
    base_url: server.baseUrl,
    settings: localProviderSettings(server.baseUrl),
    models: syncModels([], server.modelIds),
  };
}

/** Keep existing model entries (and their per-model settings) still served; add new ids; drop the rest. */
export function syncModels(existing: Model[], ids: string[]): Model[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id) ?? { id, name: id });
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
