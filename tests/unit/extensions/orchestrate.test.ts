import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppSettings } from '@shared/types';

const streamText = vi.hoisted(() => vi.fn());
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), streamText }));

const getWebSearchTools = vi.hoisted(() => vi.fn());
vi.mock('@services/ai', () => ({
  createModel: () => ({}),
  chatCallSettings: () => ({}),
  toModelMessages: async () => [],
  getWebSearchTools,
  toExecutableTools: () => ({}),
}));

const resolved = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@shared/utils/modelResolver', () => ({
  requiresApiKey: () => false,
  getProviderType: () => 'openai-compat',
}));

const listStyleOf = vi.hoisted(() => vi.fn());
vi.mock('@services/providers/listers', () => ({ listStyleOf }));
vi.mock('@services/ai/llamaServer', () => ({
  followModelLoad: () => () => undefined,
  generationStats: () => null,
  promptProgress: () => null,
}));
vi.mock('@services/mlx.service', () => ({ followMlxLoad: async () => () => undefined }));
vi.mock('@extensions/tools', () => ({
  toolRegistry: { getToolNames: () => [], getTools: () => [] },
  loadMcpSettings: async () => ({ maxToolCalls: 10 }),
  loadMcpTools: async () => [],
  generateImageTool: vi.fn(),
  GENERATE_IMAGE_TOOL: 'generate_image',
  suggestMemoryTool: { name: 'suggest_memory' },
}));

const catalog = vi.hoisted(() => ({ loaded: true, fetches: true }));
vi.mock('@services/modalities', () => ({
  modalitiesService: {
    isLoaded: () => catalog.loaded,
    ensureLoaded: async () => { catalog.loaded = catalog.fetches; },
    catalogReport: () => null,
  },
}));

const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('@shared/query/queryClient', () => ({ queryClient: { invalidateQueries } }));

import { orchestrate } from '@extensions/tool-orchestrator';

/** The SDK's stream parts for `parts`, as `streamText` hands them on. */
const streamOf = (parts: object[]) => new ReadableStream({
  start(controller) {
    parts.forEach((part) => controller.enqueue(part));
    controller.close();
  },
});

const WORDS = [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', text: 'Hi' }, { type: 'text-end', id: 't' }];

/** A reply that streams `parts` (one word by default) and ends. */
function replyOnce(parts: object[] = WORDS) {
  streamText.mockReturnValue({
    stream: streamOf([{ type: 'start' }, ...parts, { type: 'finish', finishReason: 'stop', totalUsage: {} }]),
    finishReason: Promise.resolve('stop'),
    // Two steps (a tool call, then the answer): `usage` sums them, the last step is what the window holds.
    usage: Promise.resolve({ inputTokens: 1_900, outputTokens: 120 }),
    steps: Promise.resolve([
      { usage: { inputTokens: 900, outputTokens: 20 } },
      { usage: { inputTokens: 1_000, outputTokens: 100, inputTokenDetails: { cacheReadTokens: 900 } } },
    ]),
  });
}

const callbacks = { onParts: vi.fn(), onProgress: vi.fn(), onGeneration: vi.fn() };
const run = (settings: Partial<AppSettings>) =>
  orchestrate({ messages: [], sessionId: 'c1', messageId: 'r1', model: resolved.current as never, prompt: { meetingCount: 0, timeContext: '' }, settings: settings as AppSettings, providers: [], reasoningEffort: 'provider-default' }, callbacks);

beforeEach(() => {
  vi.clearAllMocks();
  catalog.loaded = true;
  catalog.fetches = true;
  invalidateQueries.mockResolvedValue(undefined);
  getWebSearchTools.mockReturnValue({ webSearch: {} });
  listStyleOf.mockResolvedValue('openai');
  resolved.current = { provider: 'openai', modelId: 'gpt', baseUrl: '', model: { id: 'gpt' } };
  replyOnce();
});

describe('orchestrate — web search', () => {
  it('sends the provider web search by default, and not once the user turns it off', async () => {
    await run({});
    expect(getWebSearchTools).toHaveBeenCalledOnce();

    getWebSearchTools.mockClear();
    replyOnce();
    await run({ chatTools: { meetingTools: true, imageGeneration: true, webSearch: false, disabledMcpTools: [] } });
    expect(getWebSearchTools).not.toHaveBeenCalled();
  });
});

describe('orchestrate — chat models only', () => {
  it('refuses a model that does not chat, before calling it', async () => {
    resolved.current = { provider: 'openai', modelId: 'whisper-1', baseUrl: '', model: { id: 'whisper-1' } };
    await expect(run({})).rejects.toThrow(/doesn't chat/);
    expect(streamText).not.toHaveBeenCalled();
  });
});

describe('orchestrate — context use', () => {
  it('measures the window from the last step, while billing keeps the sum of every step', async () => {
    const result = await run({});
    expect(result.context).toEqual({ prompt: 1_000, cached: 900, reply: 100 });
    expect(result.tokenUsage).toMatchObject({ inputTokens: 1_900, outputTokens: 120 });
  });
});

describe('orchestrate — the reply as the SDK builds it', () => {
  it('hands on the reply\'s parts as they grow, and returns them whole', async () => {
    const result = await run({});
    expect(result.parts).toEqual([{ type: 'text', text: 'Hi', state: 'done' }]);
    expect(callbacks.onParts).toHaveBeenLastCalledWith(result.parts);
  });

  it('shows a tool call and its result in one part, with the MCP server it came from', async () => {
    replyOnce([
      { type: 'tool-call', toolCallId: 'c1', toolName: 'notion:search', input: { q: 'x' }, toolMetadata: { source: 'notion' } },
      { type: 'tool-result', toolCallId: 'c1', toolName: 'notion:search', input: { q: 'x' }, output: { content: 'found', isError: false } },
      ...WORDS,
    ]);
    const { parts } = await run({});
    expect(parts[0]).toMatchObject({
      type: 'tool-notion:search', toolCallId: 'c1', state: 'output-available', input: { q: 'x' },
      output: { content: 'found', isError: false }, toolMetadata: { source: 'notion' },
    });
  });

  it('strips web citation markers from the answer while web search is on, and only then', async () => {
    await run({});
    type Transform = (options: { tools: object; stopStream: () => void }) => TransformStream<object, { text?: string }>;
    const [{ experimental_transform: transform }] = streamText.mock.calls[0] as [{ experimental_transform: Transform }];
    const reader = streamOf([{ type: 'text-delta', id: 't', text: 'Ships Friday [1].' }])
      .pipeThrough(transform({ tools: {}, stopStream: () => undefined })).getReader();
    expect((await reader.read()).value).toMatchObject({ text: 'Ships Friday .' });

    getWebSearchTools.mockReturnValue(undefined);
    replyOnce();
    await run({});
    expect(streamText.mock.calls[1][0]).not.toHaveProperty('experimental_transform');
  });

  it('throws the stream\'s own error, not a generic one', async () => {
    const failure = new Error('rate limited');
    replyOnce([{ type: 'error', error: failure }]);
    await expect(run({})).rejects.toBe(failure);
  });

  it('refuses a reply with no words', async () => {
    replyOnce([]);
    await expect(run({})).rejects.toThrow(/no text response/);
  });
});

describe('orchestrate — llama-server tool support', () => {
  it('re-probes local servers after a reply whose model has unknown tool support', async () => {
    listStyleOf.mockResolvedValue('llama-server');
    resolved.current = { provider: 'local:llama', modelId: 'qwen', baseUrl: 'http://127.0.0.1:8080/v1', model: { id: 'qwen' } };
    await run({});
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['local-servers'] });
  });

  it('does not re-probe once tool support is known, nor for other servers', async () => {
    listStyleOf.mockResolvedValue('llama-server');
    resolved.current = { provider: 'local:llama', modelId: 'qwen', baseUrl: 'u', model: { id: 'qwen', reported: { tools: true } } };
    await run({});
    replyOnce();
    listStyleOf.mockResolvedValue('ollama');
    resolved.current = { provider: 'local:ollama', modelId: 'm', baseUrl: 'u', model: { id: 'm' } };
    await run({});
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('orchestrate — the models.dev list', () => {
  it('says it is getting the model list on a Mac without one, then goes back to the plain line', async () => {
    catalog.loaded = false;
    await run({});
    expect(callbacks.onProgress).toHaveBeenNthCalledWith(1, { stage: 'loading-catalog', percent: null });
    expect(callbacks.onProgress).toHaveBeenNthCalledWith(2, null);
    expect(streamText).toHaveBeenCalledOnce();
  });

  it('says nothing about it once the list is loaded', async () => {
    await run({});
    expect(callbacks.onProgress).not.toHaveBeenCalled();
  });

  it('stops with a plain reason when the list can\'t be downloaded, before calling the model', async () => {
    catalog.loaded = false;
    catalog.fetches = false;
    await expect(run({})).rejects.toThrow(/model list from models.dev/);
    expect(streamText).not.toHaveBeenCalled();
  });
});
