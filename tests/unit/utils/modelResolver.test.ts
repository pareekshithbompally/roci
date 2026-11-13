import { describe, it, expect, vi } from 'vitest';

vi.mock('@config/providers.config', () => ({
  MANAGED_SDK_PROVIDERS: new Set(['openai', 'anthropic', 'gemini']),
  MANAGED_SDK_INFO: {
    openai: 'OpenAI SDK',
    anthropic: 'Anthropic SDK',
    gemini: 'Google GenAI SDK',
  },
  MANAGED_DEFAULT_URLS: {
    openai: 'https://api.openai.com',
    anthropic: 'https://api.anthropic.com',
  },
}));

import {
  getProviderType,
  supportsWebSearch,
  getProviderDisplayName,
  resolveModel,
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
    ['xai', 'xai'],
    ['groq', 'groq'],
  ] as const)('maps "%s" to "%s"', (input, expected) => {
    expect(getProviderType(input)).toBe(expected);
  });

  it('defaults unknown providers to openai-compat', () => {
    expect(getProviderType('some-random-provider')).toBe('openai-compat');
    expect(getProviderType('cohere')).toBe('openai-compat');
    expect(getProviderType('')).toBe('openai-compat');
  });
});

// ── supportsWebSearch ───────────────────────────────────────────

describe('supportsWebSearch', () => {
  it.each(['gemini', 'openai', 'anthropic', 'xai', 'groq'])(
    'returns true for %s',
    (provider) => {
      expect(supportsWebSearch(provider)).toBe(true);
    }
  );

  it.each(['mistral', 'cohere', 'local-server', ''])(
    'returns false for %s',
    (provider) => {
      expect(supportsWebSearch(provider)).toBe(false);
    }
  );
});

// ── getProviderDisplayName ──────────────────────────────────────

describe('getProviderDisplayName', () => {
  it('returns known display names', () => {
    expect(getProviderDisplayName('openai')).toBe('OpenAI');
    expect(getProviderDisplayName('anthropic')).toBe('Anthropic');
    expect(getProviderDisplayName('gemini')).toBe('Google Gemini');
    expect(getProviderDisplayName('xai')).toBe('xAI (Grok)');
    expect(getProviderDisplayName('local-server')).toBe('Local Server');
  });

  it('capitalizes first letter for unknown providers', () => {
    expect(getProviderDisplayName('foobar')).toBe('Foobar');
    expect(getProviderDisplayName('myProvider')).toBe('MyProvider');
  });

  it('handles empty string', () => {
    expect(getProviderDisplayName('')).toBe('');
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
