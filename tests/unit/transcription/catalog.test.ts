import { describe, it, expect, vi } from 'vitest';

// models.dev says this one hears audio; the user never ticked it.
vi.mock('@services/modalities', () => ({
  modalitiesService: {
    getModelInfo: (_p: string, id: string) =>
      id === 'gemini-2.5-pro' ? { modalities: { input: ['text', 'audio'], output: ['text'] }, capabilities: {} } : null,
    getModelContextLimit: () => null,
  },
}));
import { adapterFor, isSpeechSelectionReady, speechModelOptions } from '@services/ai/transcription/catalog';
import { modelKey } from '@services/ai/models';
import type { ModelProvider } from '@shared/types/modelProviders';

function provider(id: string, models: ModelProvider['models'], apiKey = 'key'): ModelProvider {
  return { provider: id, active: true, api_key: apiKey, settings: [], models } as ModelProvider;
}

const providers: ModelProvider[] = [
  provider('openai', [
    { id: 'gpt-4o-transcribe' },
    { id: 'gpt-audio', name: 'GPT Audio', audioInput: true },
    { id: 'gpt-text', audioInput: false },
  ]),
  provider('gemini', [
    { id: 'gemini-3.5-flash-lite', name: 'Listed name', audioInput: true },
    { id: 'gemini-2.5-pro' },
  ]),
  provider('local:127.0.0.1:8000', [
    { id: 'Systran/faster-whisper-small' },
    { id: 'voice-llm', audioInput: true },
    { id: 'chat-llm', audioInput: false },
  ]),
];

describe('adapterFor', () => {
  it('runs curated cloud speech models on their provider endpoint', () => {
    expect(adapterFor({ provider: 'openai', model: 'gpt-4o-transcribe' }, providers)).toBe('openai-compatible');
  });

  it('runs an audio model of a provider without a speech endpoint on the multimodal adapter', () => {
    expect(adapterFor({ provider: 'gemini', model: 'gemini-3.5-flash-lite' }, providers)).toBe('multimodal');
  });

  it('runs local speech models on the OpenAI-compatible endpoint', () => {
    expect(adapterFor({ provider: 'local:127.0.0.1:8000', model: 'Systran/faster-whisper-small' }, providers))
      .toBe('openai-compatible');
  });

  it('runs any other audio-input model on the multimodal adapter, cloud or local', () => {
    expect(adapterFor({ provider: 'openai', model: 'gpt-audio' }, providers)).toBe('multimodal');
    expect(adapterFor({ provider: 'local:127.0.0.1:8000', model: 'voice-llm' }, providers)).toBe('multimodal');
  });

  it('refuses models that are neither speech models nor accept audio', () => {
    expect(adapterFor({ provider: 'openai', model: 'gpt-text' }, providers)).toBeNull();
    expect(adapterFor({ provider: 'local:127.0.0.1:8000', model: 'chat-llm' }, providers)).toBeNull();
  });

  it('runs keyless integration engines on their own adapters', () => {
    expect(adapterFor({ provider: 'hex', model: '' }, [])).toBe('hex');
    expect(adapterFor({ provider: 'apple-intelligence', model: 'apple-speech' }, [])).toBe('apple-speech');
    expect(adapterFor({ provider: 'on-device', model: 'whisper-large-v3-turbo' }, [])).toBe('on-device');
  });
});

describe('speechModelOptions', () => {
  const options = speechModelOptions(providers, {});
  const keys = options.map(modelKey);

  it('does not list a chat model just because it hears audio; ticking Audio input adds it', () => {
    expect(keys).not.toContain('gemini::gemini-2.5-pro');
  });

  it('offers models the user ticked "Audio input" for, cloud and local', () => {
    expect(keys).toContain('openai::gpt-audio');
    expect(keys).toContain('local:127.0.0.1:8000::voice-llm');
    expect(keys).not.toContain('openai::gpt-text');
    expect(keys).not.toContain('local:127.0.0.1:8000::chat-llm');
  });

  it('lists each selection once; a model the user added keeps its own name over the suggestion', () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(options.find((o) => o.model === 'gemini-3.5-flash-lite')?.label).toBe('Listed name');
  });

  it('marks audio-input models ready when their provider has a key', () => {
    const noKey = speechModelOptions([provider('openai', [{ id: 'gpt-audio', audioInput: true }], '')], {});
    expect(noKey.find((o) => o.model === 'gpt-audio')).toMatchObject({ ready: false, hint: 'Add OpenAI API key' });
    expect(options.find((o) => o.model === 'gpt-audio')).toMatchObject({ ready: true, hint: null });
  });
});

describe('on this Mac', () => {
  const onDevice = {
    models: [
      { id: 'parakeet-unified-en', name: 'Parakeet', maker: 'nvidia', kind: 'speech' as const, streams: true, bytes: 731_357_568, installed: true, downloading: false, contextTokens: null, tools: null, vision: null },
      { id: 'cohere-transcribe', name: 'Cohere Transcribe', maker: 'nvidia', kind: 'speech' as const, streams: false, bytes: 2_410_655_232, installed: false, downloading: false, contextTokens: null, tools: null, vision: null },
    ],
  };

  it('lists every curated model; one not downloaded shows its size', () => {
    const options = speechModelOptions([], { onDevice }).filter((o) => o.provider === 'on-device');
    expect(options).toEqual([
      { provider: 'on-device', model: 'parakeet-unified-en', label: 'Parakeet', ready: true, hint: null, live: true },
      { provider: 'on-device', model: 'cohere-transcribe', label: 'Cohere Transcribe', ready: false, hint: '2.4 GB', live: false },
    ]);
  });

  it('is ready only once the chosen model is downloaded', () => {
    expect(isSpeechSelectionReady({ provider: 'on-device', model: 'parakeet-unified-en' }, [], { onDevice })).toBe(true);
    expect(isSpeechSelectionReady({ provider: 'on-device', model: 'cohere-transcribe' }, [], { onDevice })).toBe(false);
    expect(isSpeechSelectionReady({ provider: 'on-device', model: 'parakeet-unified-en' }, [], {})).toBe(false);
  });
});

describe('picker order', () => {
  it('lists what runs on this Mac before key-gated cloud models', () => {
    const onDevice = { models: [{ id: 'parakeet-unified-en', name: 'Parakeet', maker: 'nvidia', kind: 'speech' as const, streams: true, bytes: 1, installed: false, downloading: false, contextTokens: null, tools: null, vision: null }] };
    const providers = Object.keys(speechModelOptions([provider('openai', [{ id: 'whisper-1' }])], { onDevice }).reduce((seen, o) => ({ ...seen, [o.provider]: true }), {} as Record<string, true>));
    expect(providers[0]).toBe('on-device');
    expect(providers.indexOf('on-device')).toBeLessThan(providers.indexOf('openai'));
  });
});
