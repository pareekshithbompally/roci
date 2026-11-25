import { describe, it, expect, vi, beforeEach } from 'vitest';

const catalogReport = vi.hoisted(() => vi.fn());
vi.mock('@services/modalities', () => ({ modalitiesService: { catalogReport } }));

import { defaultsFor, defaultsInUse, isAppleSpeech, offeredDefaults, settingsOfDefaults, speechSettings, withDefaultModels } from '@services/ai/models';
import type { SetupDefaults } from '@services/ai/models';
import type { AppSettings } from '@shared/types';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { ON_DEVICE_SETS, PROVIDER_DEFAULTS } from '@config/providerDefaults.config';

const list = (...ids: string[]) => ids.map((id) => ({ id, report: {} }));
beforeEach(() => catalogReport.mockReset().mockReturnValue(null));

describe('defaultsFor', () => {
  it('offers only models the key lists', () => {
    const defaults = defaultsFor('openai', list('gpt-6-luna', 'gpt-4o-mini-tts'), false);
    expect(defaults).toEqual({
      chat: { provider: 'openai', model: 'gpt-6-luna' }, transcription: null,
      readAloud: { provider: 'openai', model: 'gpt-4o-mini-tts' }, images: null,
    });
    expect(defaultsFor('openai', list('something-else'), false).chat).toBeNull();
  });

  it('Apple Speech stands in where a provider has no speech model', () => {
    expect(isAppleSpeech(defaultsFor('anthropic', list('claude-haiku-5-5'), true).transcription)).toBe(true);
    expect(defaultsFor('groq', list('whisper-large-v3-turbo'), true).transcription?.provider).toBe('groq');
  });

  it('a server offers its first chat and first speech model by what they do', () => {
    const defaults = defaultsFor('local:ollama', list('nomic-embed-text', 'whisper-1', 'gemma4'), false);
    expect(defaults.chat?.model).toBe('gemma4');
    expect(defaults.transcription?.model).toBe('whisper-1');
    expect(defaultsFor('local:ollama', [], false).chat).toBeNull();
  });

  it('covers this device', () => {
    expect(PROVIDER_DEFAULTS[LOCAL_MODELS_CONFIG.provider.id]).toBeDefined();
  });
});

describe('accepting them', () => {
  it('sets chat and summaries on the provider, the system voices and no images', () => {
    expect(settingsOfDefaults(defaultsFor('groq', list('openai/gpt-oss-20b', 'whisper-large-v3-turbo'), true))).toMatchObject({
      chatModel: 'groq::openai/gpt-oss-20b', analyzeModel: 'groq::openai/gpt-oss-20b',
      transcriptionProvider: 'groq', transcriptionModel: 'whisper-large-v3-turbo', readAloudEngine: 'macos', imageModel: undefined,
    });
  });

  it('leaves the speech model alone until Apple Speech can run', () => {
    expect(settingsOfDefaults(defaultsFor('anthropic', list('claude-haiku-5-5'), true))).not.toHaveProperty('transcriptionModel');
  });

  it('adds each model once, keeps the saved ones, and ticks audio on a chat model that transcribes', () => {
    const listed = list('gemini-3.1-flash-lite');
    const models = withDefaultModels([{ id: 'mine' }], defaultsFor('gemini', listed, false), 'gemini', listed);
    expect(models.map((m) => m.id)).toEqual(['mine', 'gemini-3.1-flash-lite']);
    expect(models[1].overrides).toEqual({ audio: true });
  });

  it('a dedicated speech model needs no tick', () => {
    const listed = list('openai/gpt-oss-20b', 'whisper-large-v3-turbo');
    const models = withDefaultModels([], defaultsFor('groq', listed, false), 'groq', listed);
    expect(models.every((m) => !m.overrides)).toBe(true);
  });
});

describe('in Settings › Default Models', () => {
  const settingsOf = (defaults: SetupDefaults) => ({ ...settingsOfDefaults(defaults), ...speechSettings(defaults.transcription) }) as AppSettings;

  it('judges a provider with a set on that set, a server on its saved models', () => {
    expect(offeredDefaults('gemini', [], false).images?.model).toBe('gemini-3.1-flash-lite-image');
    expect(offeredDefaults('local:ollama', list('gemma4'), false).chat?.model).toBe('gemma4');
  });

  it('is in use once applied, and not after one job changes', () => {
    const gemini = offeredDefaults('gemini', [], false);
    expect(defaultsInUse(settingsOf(gemini), gemini)).toBe(true);
    expect(defaultsInUse({ ...settingsOf(gemini), analyzeModel: 'openai::gpt-6-luna' }, gemini)).toBe(false);
    expect(defaultsInUse(settingsOf(gemini), offeredDefaults('openai', [], false))).toBe(false);
  });

  it('a set with no chat model is never in use', () => {
    const none = offeredDefaults('local:ollama', [], false);
    expect(defaultsInUse(settingsOf(none), none)).toBe(false);
  });

  it('this device offers a Western and an Indic set, each judged on its own', () => {
    const device = LOCAL_MODELS_CONFIG.provider.id;
    const indic = offeredDefaults(device, [], false, ON_DEVICE_SETS.indic);
    expect(indic.chat?.model).toBe('gemma-4-e4b');
    expect(indic.transcription?.model).toBe('indic-transcribe-flex');
    expect(defaultsInUse(settingsOf(indic), offeredDefaults(device, [], false, ON_DEVICE_SETS.western))).toBe(false);
    expect(defaultsInUse(settingsOf(indic), indic)).toBe(true);
  });
});
