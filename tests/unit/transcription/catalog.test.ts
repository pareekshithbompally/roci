import { describe, it, expect } from 'vitest';
import { adapterFor, speechModelOptions, speechSelectionKey } from '@services/ai/transcription/catalog';
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
  provider('gemini', [{ id: 'gemini-3.5-flash-lite', name: 'Listed name', audioInput: true }]),
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

  it('runs curated models of providers without a speech endpoint on the multimodal adapter', () => {
    expect(adapterFor({ provider: 'gemini', model: 'gemini-3.5-flash-lite' }, [])).toBe('multimodal');
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
  });
});

describe('speechModelOptions', () => {
  const options = speechModelOptions(providers, {});
  const keys = options.map(speechSelectionKey);

  it('offers audio-input models from active providers, cloud and local', () => {
    expect(keys).toContain('openai::gpt-audio');
    expect(keys).toContain('local:127.0.0.1:8000::voice-llm');
    expect(keys).not.toContain('openai::gpt-text');
    expect(keys).not.toContain('local:127.0.0.1:8000::chat-llm');
  });

  it('lists each selection once, with the curated label winning', () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(options.find((o) => o.model === 'gemini-3.5-flash-lite')?.label).toBe('Gemini 3.5 Flash-Lite');
  });

  it('marks audio-input models ready when their provider has a key', () => {
    const noKey = speechModelOptions([provider('openai', [{ id: 'gpt-audio', audioInput: true }], '')], {});
    expect(noKey.find((o) => o.model === 'gpt-audio')).toMatchObject({ ready: false, hint: 'Add OpenAI API key' });
    expect(options.find((o) => o.model === 'gpt-audio')).toMatchObject({ ready: true, hint: null });
  });
});
