import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppSettings } from '@shared/types';

const streamText = vi.hoisted(() => vi.fn());
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), streamText }));

const getWebSearchTools = vi.hoisted(() => vi.fn());
vi.mock('@services/ai', () => ({
  createModel: () => ({}),
  reasoningCallSettings: () => ({}),
  toSDKMessages: () => [],
  getWebSearchTools,
  toExecutableTools: () => ({}),
}));

const resolved = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@shared/utils/modelResolver', () => ({
  resolveChatModel: () => resolved.current,
  requiresApiKey: () => false,
  getProviderType: () => 'openai-compat',
}));

const isLlamaServer = vi.hoisted(() => vi.fn());
vi.mock('@services/ai/llamaServer', () => ({
  isLlamaServer,
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
}));

const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('@shared/query/queryClient', () => ({ queryClient: { invalidateQueries } }));

import { orchestrate } from '@extensions/tool-orchestrator';

/** A reply that streams one word and ends. */
function replyOnce() {
  streamText.mockReturnValue({
    stream: (async function* () { yield { type: 'text-delta', text: 'Hi' }; })(),
    finishReason: Promise.resolve('stop'),
    // Two steps (a tool call, then the answer): `usage` sums them, the last step is what the window holds.
    usage: Promise.resolve({ inputTokens: 1_900, outputTokens: 120 }),
    steps: Promise.resolve([
      { usage: { inputTokens: 900, outputTokens: 20 } },
      { usage: { inputTokens: 1_000, outputTokens: 100, inputTokenDetails: { cacheReadTokens: 900 } } },
    ]),
  });
}

const callbacks = { onChunk: vi.fn(), onReasoning: vi.fn(), onToolActivity: vi.fn() };
const run = (settings: Partial<AppSettings>) =>
  orchestrate({ messages: [], prompt: { meetingCount: 0, temporalContext: '' }, settings: settings as AppSettings, providers: [], reasoningEffort: 'provider-default' }, callbacks);

beforeEach(() => {
  vi.clearAllMocks();
  invalidateQueries.mockResolvedValue(undefined);
  getWebSearchTools.mockReturnValue({ webSearch: {} });
  isLlamaServer.mockResolvedValue(false);
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

describe('orchestrate — context use', () => {
  it('measures the window from the last step, while billing keeps the sum of every step', async () => {
    const result = await run({});
    expect(result.context).toEqual({ prompt: 1_000, cached: 900, reply: 100 });
    expect(result.tokenUsage).toMatchObject({ inputTokens: 1_900, outputTokens: 120 });
  });
});

describe('orchestrate — llama-server tool support', () => {
  it('re-probes local servers after a reply whose model has unknown tool support', async () => {
    isLlamaServer.mockResolvedValue(true);
    resolved.current = { provider: 'local:llama', modelId: 'qwen', baseUrl: 'http://127.0.0.1:8080/v1', model: { id: 'qwen' } };
    await run({});
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['local-servers'] });
  });

  it('does not re-probe once tool support is known, nor for other servers', async () => {
    isLlamaServer.mockResolvedValue(true);
    resolved.current = { provider: 'local:llama', modelId: 'qwen', baseUrl: 'u', model: { id: 'qwen', served: { tools: true } } };
    await run({});
    replyOnce();
    isLlamaServer.mockResolvedValue(false);
    resolved.current = { provider: 'local:ollama', modelId: 'm', baseUrl: 'u', model: { id: 'm' } };
    await run({});
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
