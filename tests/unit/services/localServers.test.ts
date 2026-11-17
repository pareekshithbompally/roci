import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  probeModels,
  detectLocalServers,
  toLocalProvider,
  syncModels,
  mergeServed,
  localRows,
  customServerId,
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

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('probeModels', () => {
  it('returns only model ids from a server that is not llama-server', async () => {
    serve({ 'http://127.0.0.1:11434/v1/models': models('llama3.2', 'qwen3:8b') });
    expect(await probeModels('http://127.0.0.1:11434/v1')).toEqual([{ id: 'llama3.2' }, { id: 'qwen3:8b' }]);
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
          id: 'ggml-org/LFM3-Omni-2B-GGUF:Q8_0',
          architecture: { input_modalities: ['text', 'image', 'audio', 'video'], output_modalities: ['text', 'audio'] },
          context_length: 128000,
          status: { value: 'loaded', preset: '[ggml-org/LFM3-Omni-2B-GGUF:Q8_0]\nctx-size = 32768\nn-predict = 8192\n' },
        }],
      },
    });
    expect(await probeModels('http://127.0.0.1:9931/v1')).toEqual([{
      id: 'ggml-org/LFM3-Omni-2B-GGUF:Q8_0',
      served: { modalities: { input: ['text', 'image', 'audio', 'video'], output: ['text', 'audio'] }, contextTokens: 32768, tools: true, thinking: true },
      loaded: true,
    }]);
  });

  it('leaves an unloaded llama-server model without tools or thinking (it is never loaded to ask)', async () => {
    serve({
      'http://127.0.0.1:9932/props': { build_info: 'b12110' },
      'http://127.0.0.1:9932/v1/models': { data: [{ id: 'gemma', context_length: 4096, status: { value: 'unloaded' } }] },
    });
    expect(await probeModels('http://127.0.0.1:9932/v1')).toEqual([{ id: 'gemma', served: { contextTokens: 4096 }, loaded: false }]);
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
    expect(ollama).toMatchObject({ running: true, models: [{ id: 'llama3.2' }] });
    expect(servers.filter((s) => s.running)).toHaveLength(1);
  });

  it('treats a known port whose fingerprint misses as a custom server', async () => {
    serve({ 'http://127.0.0.1:11434/v1/models': models('mlx-model') });
    const servers = await detectLocalServers([]);
    const running = servers.filter((s) => s.running);
    expect(running).toEqual([
      { id: 'local:127.0.0.1:11434', baseUrl: 'http://127.0.0.1:11434/v1', running: true, models: [{ id: 'mlx-model' }] },
    ]);
  });

  it('does not probe ports with no known engine', async () => {
    serve({ 'http://127.0.0.1:9000/v1/models': models('custom') });
    const servers = await detectLocalServers([]);
    expect(servers.filter((s) => s.running)).toEqual([]);
  });

  it('shows a server on llama.cpp\'s port that is not llama.cpp (MLX, LocalAI) as a generic local server', async () => {
    serve({ 'http://127.0.0.1:8080/v1/models': models('mlx-model') });
    const servers = await detectLocalServers([]);
    expect(servers.filter((s) => s.running)).toEqual([
      { id: 'local:127.0.0.1:8080', baseUrl: 'http://127.0.0.1:8080/v1', running: true, models: [{ id: 'mlx-model' }] },
    ]);
  });

  it('probes a saved provider at its own URL and skips the known port it covers', async () => {
    serve({ 'http://127.0.0.1:9000/v1/models': models('custom') });
    const saved = toLocalProvider({ id: 'local:ollama', baseUrl: 'http://127.0.0.1:9000/v1', running: true, models: [] });
    const servers = await detectLocalServers([saved]);
    expect(servers.filter((s) => s.id === 'local:ollama')).toEqual([
      { id: 'local:ollama', baseUrl: 'http://127.0.0.1:9000/v1', running: true, models: [{ id: 'custom' }] },
    ]);
  });
});

describe('toLocalProvider', () => {
  it('saves an active provider with the uniform default key, base URL and served models', () => {
    const p = toLocalProvider({ id: 'local:ollama', baseUrl: 'http://127.0.0.1:11434/v1', running: true, models: [{ id: 'a' }] });
    expect(p).toMatchObject({ active: true, provider: 'local:ollama', api_key: LOCAL_SERVER_DEFAULT_API_KEY });
    expect(p.settings.find((s) => s.key === 'api-key')?.controller_props.value).toBe(LOCAL_SERVER_DEFAULT_API_KEY);
    expect(p.settings.find((s) => s.key === 'base-url')?.controller_props.value).toBe('http://127.0.0.1:11434/v1');
    expect(p.models).toEqual([{ id: 'a', name: 'a' }]);
  });
});

describe('syncModels', () => {
  it('keeps the user\'s own choices, refreshes what the server reports, adds new ids, drops the rest', () => {
    const existing = [{ id: 'keep', name: 'keep', displayName: 'Keep', toolsEnabled: true, served: { contextTokens: 4096 } }, { id: 'gone', name: 'gone' }];
    expect(syncModels(existing, [{ id: 'keep', served: { contextTokens: 32768 } }, { id: 'new' }])).toEqual([
      { id: 'keep', name: 'keep', displayName: 'Keep', toolsEnabled: true, served: { contextTokens: 32768 } },
      { id: 'new', name: 'new' },
    ]);
  });
});

describe('localRows', () => {
  it('shows running servers and saved ones that stopped, attaching the saved provider', () => {
    const saved: ModelProvider = toLocalProvider({ id: 'local:vllm', baseUrl: 'http://127.0.0.1:8000/v1', running: true, models: [] });
    const rows = localRows(
      [
        { id: 'local:ollama', baseUrl: 'u1', running: true, models: [{ id: 'm' }] },
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
    expect(normalizeLocalUrl('192.168.1.20:8080')).toBe('http://192.168.1.20:8080/v1');
    expect(normalizeLocalUrl('https://llm.example.com')).toBe('https://llm.example.com/v1');
  });
});

describe('mergeServed', () => {
  it('keeps tools and thinking learned while loaded when the list no longer says', () => {
    expect(mergeServed({ contextTokens: 8, tools: true, thinking: false }, { contextTokens: 16 }))
      .toEqual({ contextTokens: 16, tools: true, thinking: false });
  });

  it('takes what the server reports now over what was learned before', () => {
    expect(mergeServed({ tools: true, thinking: true }, { tools: false, thinking: false })).toEqual({ tools: false, thinking: false });
  });

  it('adds nothing a server never reported', () => {
    expect(mergeServed(undefined, { contextTokens: 4 })).toEqual({ contextTokens: 4 });
  });
});
