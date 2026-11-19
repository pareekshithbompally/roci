import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listServerModels,
  detectLocalServers,
  toLocalProvider,
  syncModels,
  localRows,
  customServerId,
  needsHttps,
  normalizeLocalUrl,
} from '@services/providers/localServers';
import { LOCAL_SERVER_DEFAULT_API_KEY } from '@config/localServers.config';
import type { ModelProvider } from '@shared/types/modelProviders';

/** The app's fetch is the Tauri plugin's; here it goes to the fake network below. */
vi.mock('@services/platform-fetch', () => ({ getPlatformFetch: () => (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) }));

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
const listed = (...ids: string[]) => ids.map((id) => ({ id, report: {} }));

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('listServerModels', () => {
  it('lists ids from an unknown server that speaks no richer format', async () => {
    serve({ 'http://127.0.0.1:9000/v1/models': models('llama3.2', 'qwen3:8b') });
    expect(await listServerModels('local:127.0.0.1:9000', 'http://127.0.0.1:9000/v1')).toEqual(listed('llama3.2', 'qwen3:8b'));
  });

  it('reads Ollama in its own format with one request, never llama-server\'s /props', async () => {
    serve({
      'http://127.0.0.1:11434/api/tags': {
        models: [{ name: 'gemma4:31b-cloud', capabilities: ['completion', 'thinking', 'tools', 'vision'], details: { context_length: 262_144 } }],
      },
    });
    expect(await listServerModels('local:ollama', 'http://127.0.0.1:11434/v1')).toEqual([{
      id: 'gemma4:31b-cloud',
      report: { input: ['text', 'image'], output: ['text'], tools: true, reasoning: true, contextTokens: 262_144 },
    }]);
    expect(vi.mocked(globalThis.fetch).mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:11434/api/tags']);
  });

  it('adds what llama-server reports: modalities, running context, loaded, and a loaded model\'s tools and thinking', async () => {
    const lfm = 'ggml-org/LFM3-Omni-2B-GGUF:Q8_0';
    serve({
      'http://127.0.0.1:9931/props': { build_info: 'b12110' },
      [`http://127.0.0.1:9931/props?${new URLSearchParams({ model: lfm, autoload: 'false' })}`]: {
        chat_template: '{%- if enable_thinking %}<think>{% endif %}',
        chat_template_caps: { supports_tools: true },
      },
      'http://127.0.0.1:9931/v1/models': {
        data: [{
          id: lfm,
          architecture: { input_modalities: ['text', 'image', 'audio', 'video'], output_modalities: ['text', 'audio'] },
          context_length: 128000,
          status: { value: 'loaded', preset: `[${lfm}]\nctx-size = 32768\nn-predict = 8192\n` },
        }],
      },
    });
    expect(await listServerModels('local:127.0.0.1:9931', 'http://127.0.0.1:9931/v1')).toEqual([{
      id: lfm,
      report: { input: ['text', 'image', 'audio', 'video'], output: ['text', 'audio'], contextTokens: 32768, tools: true, reasoning: true },
      loaded: true,
    }]);
  });

  it('leaves an unloaded llama-server model without tools or thinking (it is never loaded to ask)', async () => {
    serve({
      'http://127.0.0.1:9932/props': { build_info: 'b12110' },
      'http://127.0.0.1:9932/v1/models': { data: [{ id: 'gemma', context_length: 4096, status: { value: 'unloaded' } }] },
    });
    expect(await listServerModels('local:127.0.0.1:9932', 'http://127.0.0.1:9932/v1')).toEqual([{ id: 'gemma', report: { contextTokens: 4096 }, loaded: false }]);
  });

  it('returns null when nothing listens or the server refuses', async () => {
    serve({ 'http://127.0.0.1:1/v1/models': 500 });
    expect(await listServerModels('local:127.0.0.1:9', 'http://127.0.0.1:9/v1')).toBeNull();
    expect(await listServerModels('local:127.0.0.1:1', 'http://127.0.0.1:1/v1')).toBeNull();
  });
});

describe('detectLocalServers', () => {
  it('finds running known engines and marks the rest not running', async () => {
    serve({ 'http://127.0.0.1:11434/api/tags': { models: [{ name: 'llama3.2' }] } });
    const servers = await detectLocalServers([], true);
    const ollama = servers.find((s) => s.id === 'local:ollama');
    expect(ollama).toMatchObject({ running: true, models: listed('llama3.2') });
    expect(servers.filter((s) => s.running)).toHaveLength(1);
  });

  it('treats a known port whose fingerprint misses as a custom server', async () => {
    serve({ 'http://127.0.0.1:8000/v1/models': models('mlx-model') });
    const servers = await detectLocalServers([], true);
    const running = servers.filter((s) => s.running);
    expect(running).toEqual([
      { id: 'local:127.0.0.1:8000', baseUrl: 'http://127.0.0.1:8000/v1', running: true, models: listed('mlx-model') },
    ]);
  });

  it('does not probe ports with no known engine', async () => {
    serve({ 'http://127.0.0.1:9000/v1/models': models('custom') });
    const servers = await detectLocalServers([], true);
    expect(servers.filter((s) => s.running)).toEqual([]);
  });

  it('shows a server on llama.cpp\'s port that is not llama.cpp (MLX, LocalAI) as a generic local server', async () => {
    serve({ 'http://127.0.0.1:8080/v1/models': models('mlx-model') });
    const servers = await detectLocalServers([], true);
    expect(servers.filter((s) => s.running)).toEqual([
      { id: 'local:127.0.0.1:8080', baseUrl: 'http://127.0.0.1:8080/v1', running: true, models: listed('mlx-model') },
    ]);
  });

  it('probes a saved provider at its own URL and skips the known port it covers', async () => {
    serve({ 'http://127.0.0.1:9000/api/tags': { models: [{ name: 'custom' }] } });
    const saved = toLocalProvider({ id: 'local:ollama', baseUrl: 'http://127.0.0.1:9000/v1', running: true, models: [] });
    const servers = await detectLocalServers([saved], true);
    expect(servers.filter((s) => s.id === 'local:ollama')).toEqual([
      { id: 'local:ollama', baseUrl: 'http://127.0.0.1:9000/v1', running: true, models: listed('custom') },
    ]);
  });

  it('on a device that runs no servers, probes only the saved ones', async () => {
    serve({
      'http://127.0.0.1:11434/api/tags': { models: [{ name: 'llama3.2' }] },
      'https://mac-mini.tailnet.ts.net/v1/models': models('qwen'),
    });
    const saved = toLocalProvider({ id: 'local:mac-mini.tailnet.ts.net', baseUrl: 'https://mac-mini.tailnet.ts.net/v1', running: true, models: [] });
    const servers = await detectLocalServers([saved], false);
    expect(servers).toEqual([
      { id: 'local:mac-mini.tailnet.ts.net', baseUrl: 'https://mac-mini.tailnet.ts.net/v1', running: true, models: listed('qwen') },
    ]);
  });
});

describe('toLocalProvider', () => {
  it('saves an active provider with the uniform default key, base URL and served models', () => {
    const p = toLocalProvider({ id: 'local:ollama', baseUrl: 'http://127.0.0.1:11434/v1', running: true, models: listed('a') });
    expect(p).toMatchObject({ active: true, provider: 'local:ollama', api_key: LOCAL_SERVER_DEFAULT_API_KEY });
    expect(p.settings.find((s) => s.key === 'api-key')?.controller_props.value).toBe(LOCAL_SERVER_DEFAULT_API_KEY);
    expect(p.settings.find((s) => s.key === 'base-url')?.controller_props.value).toBe('http://127.0.0.1:11434/v1');
    expect(p.models).toEqual([{ id: 'a', name: 'a' }]);
  });
});

describe('syncModels', () => {
  it('keeps the user\'s own choices, refreshes what the server reports, adds new ids, drops the rest', () => {
    const existing = [{ id: 'keep', name: 'keep', displayName: 'Keep', overrides: { tools: true }, reported: { contextTokens: 4096 } }, { id: 'gone', name: 'gone' }];
    expect(syncModels(existing, [{ id: 'keep', report: { contextTokens: 32768 } }, { id: 'new', report: {} }])).toEqual([
      { id: 'keep', name: 'keep', displayName: 'Keep', overrides: { tools: true }, reported: { contextTokens: 32768 } },
      { id: 'new', name: 'new' },
    ]);
  });
});

describe('localRows', () => {
  it('shows running servers and saved ones that stopped, attaching the saved provider', () => {
    const saved: ModelProvider = toLocalProvider({ id: 'local:vllm', baseUrl: 'http://127.0.0.1:8000/v1', running: true, models: [] });
    const rows = localRows(
      [
        { id: 'local:ollama', baseUrl: 'u1', running: true, models: listed('m') },
        { id: 'local:vllm', baseUrl: 'u2', running: false, models: [] },
        { id: 'local:jan', baseUrl: 'u3', running: false, models: [] },
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

  it('rejects a bare word (a typo, not a host) and accepts localhost, IPs and dotted names', () => {
    expect(normalizeLocalUrl('dkjcnwkcjnwnvc')).toBeNull();
    expect(normalizeLocalUrl('http://server')).toBeNull();
    expect(normalizeLocalUrl('localhost:11434')).toBe('http://localhost:11434/v1');
    expect(normalizeLocalUrl('192.168.1.20:8080')).toBe('https://192.168.1.20:8080/v1');
    expect(normalizeLocalUrl('https://llm.example.com')).toBe('https://llm.example.com/v1');
  });
});

describe('server addresses', () => {
  it('reaches this device over http and any other computer over https when no scheme is typed', () => {
    expect(normalizeLocalUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080/v1');
    expect(normalizeLocalUrl('mac-mini.tailnet.ts.net')).toBe('https://mac-mini.tailnet.ts.net/v1');
  });

  it('asks for https only for another computer typed with plain http', () => {
    expect(needsHttps('http://localhost:11434/v1')).toBe(false);
    expect(needsHttps('http://127.0.0.1:8080/v1')).toBe(false);
    expect(needsHttps('http://mac-mini.tailnet.ts.net:8080/v1')).toBe(true);
    expect(needsHttps('https://mac-mini.tailnet.ts.net/v1')).toBe(false);
  });
});
