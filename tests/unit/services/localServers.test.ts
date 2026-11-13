import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  probeModels,
  detectLocalServers,
  toLocalProvider,
  syncModels,
  localRows,
  customServerId,
  normalizeLocalUrl,
} from '@services/providers/localServers';
import { LOCAL_SERVER_DEFAULT_API_KEY } from '@config/localServers.config';
import type { ModelProvider } from '@shared/types/modelProviders';

/** Fake network: url → JSON body (200) | number (status). Anything else is refused. */
function serve(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!(url in routes)) throw new TypeError('connection refused');
    const route = routes[url];
    if (typeof route === 'number') return new Response(null, { status: route });
    return new Response(JSON.stringify(route), { status: 200 });
  }));
}

const models = (...ids: string[]) => ({ data: ids.map((id) => ({ id })) });

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('probeModels', () => {
  it('returns model ids from an OpenAI-compatible /models', async () => {
    serve({ 'http://127.0.0.1:11434/v1/models': models('llama3.2', 'qwen3:8b') });
    expect(await probeModels('http://127.0.0.1:11434/v1')).toEqual(['llama3.2', 'qwen3:8b']);
  });

  it('returns null when nothing listens, on non-200, or on a non-OpenAI body', async () => {
    serve({ 'http://127.0.0.1:1/v1/models': 500, 'http://127.0.0.1:2/v1/models': { models: [] } });
    expect(await probeModels('http://127.0.0.1:9/v1')).toBeNull();
    expect(await probeModels('http://127.0.0.1:1/v1')).toBeNull();
    expect(await probeModels('http://127.0.0.1:2/v1')).toBeNull();
  });
});

describe('detectLocalServers', () => {
  it('finds running known engines and marks the rest not running', async () => {
    serve({
      'http://127.0.0.1:11434/v1/models': models('llama3.2'),
      'http://127.0.0.1:11434/api/version': { version: '0.9' },
    });
    const servers = await detectLocalServers([]);
    const ollama = servers.find((s) => s.id === 'local:ollama');
    expect(ollama).toMatchObject({ running: true, modelIds: ['llama3.2'] });
    expect(servers.filter((s) => s.running)).toHaveLength(1);
  });

  it('treats a shared port whose fingerprint misses as a custom server', async () => {
    serve({ 'http://127.0.0.1:8080/v1/models': models('mlx-model') });
    const servers = await detectLocalServers([]);
    const running = servers.filter((s) => s.running);
    expect(running).toEqual([
      { id: 'local:127.0.0.1:8080', baseUrl: 'http://127.0.0.1:8080/v1', running: true, modelIds: ['mlx-model'] },
    ]);
  });

  it('probes a saved provider at its own URL and skips the known port it covers', async () => {
    serve({ 'http://127.0.0.1:9000/v1/models': models('custom') });
    const saved = toLocalProvider({ id: 'local:ollama', baseUrl: 'http://127.0.0.1:9000/v1', running: true, modelIds: [] });
    const servers = await detectLocalServers([saved]);
    expect(servers.filter((s) => s.id === 'local:ollama')).toEqual([
      { id: 'local:ollama', baseUrl: 'http://127.0.0.1:9000/v1', running: true, modelIds: ['custom'] },
    ]);
  });
});

describe('toLocalProvider', () => {
  it('saves an active provider with the uniform default key, base URL and served models', () => {
    const p = toLocalProvider({ id: 'local:ollama', baseUrl: 'http://127.0.0.1:11434/v1', running: true, modelIds: ['a'] });
    expect(p).toMatchObject({ active: true, provider: 'local:ollama', api_key: LOCAL_SERVER_DEFAULT_API_KEY });
    expect(p.settings.find((s) => s.key === 'api-key')?.controller_props.value).toBe(LOCAL_SERVER_DEFAULT_API_KEY);
    expect(p.settings.find((s) => s.key === 'base-url')?.controller_props.value).toBe('http://127.0.0.1:11434/v1');
    expect(p.models).toEqual([{ id: 'a', name: 'a' }]);
  });
});

describe('syncModels', () => {
  it('keeps per-model settings, adds new ids, drops ids no longer served', () => {
    const existing = [{ id: 'keep', name: 'keep', toolsEnabled: true }, { id: 'gone', name: 'gone' }];
    expect(syncModels(existing, ['keep', 'new'])).toEqual([
      { id: 'keep', name: 'keep', toolsEnabled: true },
      { id: 'new', name: 'new' },
    ]);
  });
});

describe('localRows', () => {
  it('shows running servers and saved ones that stopped, attaching the saved provider', () => {
    const saved: ModelProvider = toLocalProvider({ id: 'local:vllm', baseUrl: 'http://127.0.0.1:8000/v1', running: true, modelIds: [] });
    const rows = localRows(
      [
        { id: 'local:ollama', baseUrl: 'u1', running: true, modelIds: ['m'] },
        { id: 'local:vllm', baseUrl: 'u2', running: false, modelIds: [] },
        { id: 'local:jan', baseUrl: 'u3', running: false, modelIds: [] },
      ],
      [saved],
    );
    expect(rows.map((r) => [r.id, r.running, r.saved?.provider ?? null])).toEqual([
      ['local:ollama', true, null],
      ['local:vllm', false, 'local:vllm'],
    ]);
  });
});

describe('customServerId', () => {
  it('names a custom server by host and port', () => {
    expect(customServerId('http://localhost:9000/v1')).toBe('local:localhost:9000');
  });
});

describe('normalizeLocalUrl', () => {
  it('adds the scheme and the /v1 path when missing, keeps an explicit path', () => {
    expect(normalizeLocalUrl('localhost:9000')).toBe('http://localhost:9000/v1');
    expect(normalizeLocalUrl('http://127.0.0.1:9000/')).toBe('http://127.0.0.1:9000/v1');
    expect(normalizeLocalUrl('http://127.0.0.1:9000/api/v1')).toBe('http://127.0.0.1:9000/api/v1');
  });

  it('rejects empty or invalid input', () => {
    expect(normalizeLocalUrl('  ')).toBeNull();
    expect(normalizeLocalUrl('http://')).toBeNull();
  });
});
