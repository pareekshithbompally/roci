import { describe, it, expect, vi } from 'vitest';

vi.mock('@config/providers.config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@config/providers.config')>()),
  MANAGED_SDK_PROVIDERS: new Set(['openai', 'anthropic', 'gemini']),
  MANAGED_DEFAULT_URLS: {
    openai: 'https://api.openai.com',
    anthropic: 'https://api.anthropic.com',
  },
}));

import {
  getProviderType,
  requiresApiKey,
  resolveModel,
  resolveChatModel,
  getAllActiveModels,
} from '@shared/utils/modelResolver';

// ── Helpers ─────────────────────────────────────────────────────

const makeModel = (id: string, name?: string) => ({
  id,
  name: name || id,
  displayName: name || id,
});

const makeProvider = (
  provider: string,
  active = true,
  models: ReturnType<typeof makeModel>[] = []
) => ({
  provider,
  active,
  api_key: 'test-key',
  base_url: 'https://api.test.com',
  models,
  settings: [
    { key: 'api-key', controller_props: { value: 'settings-key' } },
    { key: 'base-url', controller_props: { value: '' } },
  ],
});

// ── getProviderType ─────────────────────────────────────────────

describe('getProviderType', () => {
  it.each([
    ['gemini', 'gemini'],
    ['anthropic', 'anthropic'],
    ['openai', 'openai'],
    ['mistral', 'mistral'],
    ['groq', 'groq'],
  ] as const)('maps "%s" to "%s"', (input, expected) => {
    expect(getProviderType(input)).toBe(expected);
  });

  it('defaults unknown and retired providers to openai-compat', () => {
    expect(getProviderType('some-random-provider')).toBe('openai-compat');
    expect(getProviderType('cohere')).toBe('openai-compat');
    expect(getProviderType('xai')).toBe('openai-compat');
    expect(getProviderType('')).toBe('openai-compat');
  });
});

// ── resolveModel ────────────────────────────────────────────────

describe('resolveModel', () => {
  it('finds a model in an active provider', () => {
    const providers = [
      makeProvider('openai', true, [makeModel('gpt-4o', 'GPT-4o')]),
    ];
    const resolved = resolveModel('gpt-4o', providers as any);

    expect(resolved).not.toBeNull();
    expect(resolved!.modelId).toBe('gpt-4o');
    expect(resolved!.provider).toBe('openai');
    expect(resolved!.apiKey).toBe('settings-key');
    expect(resolved!.model.id).toBe('gpt-4o');
  });

  it('skips inactive providers', () => {
    const providers = [
      makeProvider('openai', false, [makeModel('gpt-4o')]),
      makeProvider('anthropic', true, [makeModel('gpt-4o')]),
    ];
    const resolved = resolveModel('gpt-4o', providers as any);

    expect(resolved).not.toBeNull();
    expect(resolved!.provider).toBe('anthropic');
  });

  it('returns null for unknown model', () => {
    const providers = [makeProvider('openai', true, [makeModel('gpt-4o')])];
    expect(resolveModel('nonexistent', providers as any)).toBeNull();
  });

  it('returns null for empty modelId', () => {
    const providers = [makeProvider('openai', true, [makeModel('gpt-4o')])];
    expect(resolveModel('', providers as any)).toBeNull();
  });

  it('returns null for empty providers array', () => {
    expect(resolveModel('gpt-4o', [])).toBeNull();
  });

  it('uses api_key fallback when settings key is empty', () => {
    const provider = makeProvider('openai', true, [makeModel('gpt-4o')]);
    provider.settings[0].controller_props.value = '';
    const resolved = resolveModel('gpt-4o', [provider] as any);

    expect(resolved!.apiKey).toBe('test-key');
  });

  it('resolves the first matching model across multiple providers', () => {
    const providers = [
      makeProvider('openai', true, [makeModel('shared-model', 'From OpenAI')]),
      makeProvider('anthropic', true, [makeModel('shared-model', 'From Anthropic')]),
    ];
    const resolved = resolveModel('shared-model', providers as any);

    expect(resolved!.provider).toBe('openai');
  });
});

// ── resolveChatModel ──────────────────────────────────────────────

// Apple Intelligence is a chat model while its integration is on (no tool calling, small context).
describe('resolveChatModel', () => {
  const appleSettings = (enabled: boolean) =>
    ({
      chatModel: 'apple-intelligence',
      appleIntelligenceIntegration: { enabled },
    }) as any;

  it('resolves Apple Intelligence only while its switch is on', () => {
    expect(resolveChatModel(appleSettings(true), [])?.provider).toBe('apple-intelligence');
    expect(resolveChatModel(appleSettings(false), [])).toBeNull();
  });

  it('resolves user providers while the Apple switch is on', () => {
    const providers = [makeProvider('openai', true, [makeModel('gpt-4o')])];
    const settings = {
      chatModel: 'gpt-4o',
      appleIntelligenceIntegration: { enabled: true },
    } as any;
    const resolved = resolveChatModel(settings, providers as any);

    expect(resolved!.provider).toBe('openai');
  });

  it('keyed providers still require a key', () => {
    const providers = [makeProvider('openai', true, [makeModel('gpt-4o')])];
    const resolved = resolveChatModel({ chatModel: 'gpt-4o' } as any, providers as any);

    expect(requiresApiKey(resolved!)).toBe(true);
  });
});

// ── getAllActiveModels ───────────────────────────────────────────

describe('getAllActiveModels', () => {
  it('collects models from active providers', () => {
    const providers = [
      makeProvider('openai', true, [makeModel('gpt-4o', 'GPT-4o')]),
      makeProvider('anthropic', true, [makeModel('claude-3', 'Claude 3')]),
    ];
    const models = getAllActiveModels(providers as any);

    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      providerName: 'OpenAI',
    });
    expect(models[1]).toEqual({
      id: 'claude-3',
      name: 'Claude 3',
      provider: 'anthropic',
      providerName: 'Anthropic',
    });
  });

  it('skips inactive providers', () => {
    const providers = [
      makeProvider('openai', false, [makeModel('gpt-4o')]),
      makeProvider('anthropic', true, [makeModel('claude-3')]),
    ];
    const models = getAllActiveModels(providers as any);

    expect(models).toHaveLength(1);
    expect(models[0].provider).toBe('anthropic');
  });

  it('returns empty array when no active providers', () => {
    const providers = [makeProvider('openai', false, [makeModel('gpt-4o')])];
    expect(getAllActiveModels(providers as any)).toEqual([]);
  });

  it('returns empty array for empty providers list', () => {
    expect(getAllActiveModels([])).toEqual([]);
  });

  it('handles providers with no models', () => {
    const providers = [makeProvider('openai', true, [])];
    expect(getAllActiveModels(providers as any)).toEqual([]);
  });

  it('handles provider with undefined models array', () => {
    const provider = makeProvider('openai', true);
    (provider as any).models = undefined;
    expect(getAllActiveModels([provider] as any)).toEqual([]);
  });
});

describe('models from integrations', () => {
  it('Apple Intelligence joins the model sources only while its integration is on', async () => {
    const { modelSources, resolveSummaryModel, requiresApiKey } = await import('@shared/utils/modelResolver');
    const off = { analyzeModel: 'apple-intelligence' } as never;
    const on = { analyzeModel: 'apple-intelligence', appleIntelligenceIntegration: { enabled: true } } as never;
    expect(modelSources([], off)).toEqual([]);
    expect(resolveSummaryModel(off, [])).toBeNull();
    const resolved = resolveSummaryModel(on, []);
    expect(resolved?.provider).toBe('apple-intelligence');
    expect(requiresApiKey(resolved!)).toBe(false);
  });

  it('a downloaded chat model reports its context window, as a server does, so the context ring shows', async () => {
    const { modelSources } = await import('@shared/utils/modelResolver');
    const gemma = {
      id: 'gemma-4-e2b', name: 'Gemma 4', maker: 'google', kind: 'chat' as const, streams: false, bytes: 1,
      installed: true, downloading: false, contextTokens: 131_072,
    };
    const [onDevice] = modelSources([], {} as never, [gemma]);
    expect(onDevice.models[0].served?.contextTokens).toBe(131_072);
  });
});
