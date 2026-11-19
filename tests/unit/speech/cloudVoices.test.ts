import { describe, it, expect, vi } from 'vitest';

vi.mock('@services/modalities', () => ({ modalitiesService: { catalogReport: () => null } }));

import { cloudVoiceOptions, cloudVoices } from '@services/ai/speech/catalog';
import { modelKey, parseModelKey } from '@services/ai/models';
import type { ModelProvider } from '@shared/types/modelProviders';

const provider = (id: string, models: string[], apiKey = 'k'): ModelProvider =>
  ({ provider: id, active: true, api_key: apiKey, settings: [], models: models.map((m) => ({ id: m })) }) as ModelProvider;

describe('cloud voice engines', () => {
  it('a cloud engine key holds provider and model; the system and downloaded voices are not cloud engines', () => {
    expect(parseModelKey(modelKey({ provider: 'gemini', model: 'gemini-3.8-flash-tts' }))).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash-tts' });
    expect(parseModelKey('macos')).toBeNull();
    expect(parseModelKey('pocket-tts')).toBeNull();
  });

  it('offers only the voice models the user added, on providers that speak', () => {
    const options = cloudVoiceOptions([provider('gemini', ['gemini-3.8-flash-lite-tts']), provider('openai', []), provider('openrouter', ['some-tts'])]);
    expect(options.map((o) => `${o.provider}/${o.model}`)).toEqual(['gemini/gemini-3.8-flash-lite-tts']);
  });

  it('is ready once its provider has a key', () => {
    expect(cloudVoiceOptions([provider('openai', ['gpt-4o-mini-tts'], '')])[0]).toMatchObject({ ready: false, hint: 'Add OpenAI API key' });
  });

  it('lists a provider\'s voices, default first', () => {
    expect(cloudVoices('openai')[0]).toBe('alloy');
    expect(cloudVoices('mistral')).toEqual([]);
  });
});
