import { describe, it, expect, vi, beforeEach } from 'vitest';

const catalogReport = vi.hoisted(() => vi.fn());
vi.mock('@services/modalities', () => ({ modalitiesService: { catalogReport } }));

import { featuresOf, fitsJob, jobRecords, modelRecords, modelsFor, modelSourceOf, profileOf, transcribeAdapter } from '@services/ai/models';
import type { ModelRecord } from '@services/ai/models';
import type { ModelProvider } from '@shared/types/modelProviders';

const keyed = (provider: string, ids: string[], apiKey = 'k'): ModelProvider => ({
  provider,
  active: true,
  api_key: apiKey,
  settings: [],
  models: ids.map((id) => ({ id })),
});

const allDefault = { input: 'default', output: 'default', tools: 'default', reasoning: 'default', contextTokens: 'default' } as const;

const record = (over: Partial<ModelRecord>): ModelRecord => ({
  provider: 'openai', id: 'm', label: 'm', source: 'cloud', input: [], output: [],
  tools: false, reasoning: false, contextTokens: null, known: false, sourceOf: allDefault, ready: true, hint: null, ...over,
});

const catalog = (report: object, exact = true) => catalogReport.mockReturnValue({ report, exact });

beforeEach(() => {
  catalogReport.mockReset().mockReturnValue(null);
});

describe('profileOf — first source to state a fact wins', () => {
  it('an unknown model on a language-model provider is assumed to chat, never with tools', () => {
    expect(profileOf('gemini', { id: 'mystery-1' })).toEqual({
      input: ['text'], output: ['text'], tools: false, reasoning: false, contextTokens: null, known: false, sourceOf: allDefault,
    });
  });

  it('an unknown model on a speech provider is assumed to transcribe', () => {
    expect(profileOf('deepgram', { id: 'whatever' })).toMatchObject({ input: ['audio'], output: ['text'], known: false });
  });

  it('models.dev describes a model it lists', () => {
    catalog({ input: ['text', 'image'], output: ['text'], tools: true, reasoning: true, contextTokens: 200_000 });
    expect(profileOf('anthropic', { id: 'claude' })).toEqual({
      input: ['text', 'image'], output: ['text'], tools: true, reasoning: true, contextTokens: 200_000, known: true,
      sourceOf: { input: 'catalog', output: 'catalog', tools: 'catalog', reasoning: 'catalog', contextTokens: 'catalog' },
    });
  });

  it('a catalog match by a similar name gives only inputs and outputs, marked a guess; never tools or a context window', () => {
    catalog({ input: ['text', 'image'], output: ['text'], tools: true, contextTokens: 128_000 }, false);
    const profile = profileOf('local:127.0.0.1:8000', { id: 'gemma4:31b' });
    expect(profile).toMatchObject({ input: ['text', 'image'], tools: false, contextTokens: null });
    expect(featuresOf(profile)).toEqual([{ feature: 'vision', guessed: true }]);
  });

  it('a name rule about the model itself beats a similar name from another host: gpt-4o-mini-transcribe hears, so it is speech', () => {
    catalog({ input: ['text', 'audio'], output: ['text'] }, false);
    expect(profileOf('openai', { id: 'gpt-4o-mini-transcribe' })).toMatchObject({ input: ['audio'], output: ['text'], sourceOf: { input: 'name-rule' } });
  });

  it('what the provider\'s list reports beats models.dev, fact by fact', () => {
    catalog({ input: ['text'], output: ['text'], tools: false, contextTokens: 8_000 });
    expect(profileOf('local:127.0.0.1:9931', { id: 'lfm', reported: { input: ['text', 'audio'], tools: true, reasoning: true } })).toMatchObject({
      input: ['text', 'audio'], output: ['text'], tools: true, reasoning: true, contextTokens: 8_000,
      sourceOf: { input: 'provider', output: 'catalog', tools: 'provider', contextTokens: 'catalog' },
    });
  });

  it('the user\'s corrections beat every source', () => {
    catalog({ input: ['text', 'audio'], output: ['text'], tools: true });
    const profile = profileOf('openai', { id: 'gpt', reported: { reasoning: true }, overrides: { tools: false, audio: false } });
    expect(profile).toMatchObject({ input: ['text'], tools: false, reasoning: true, sourceOf: { input: 'user', tools: 'user', reasoning: 'provider' } });
    expect(featuresOf(profile)).toEqual([{ feature: 'thinking', guessed: false }]);
  });

  it('name rules describe a model nothing else knows, without granting tools', () => {
    expect(profileOf('gemini', { id: 'gemini-3.5-transcribe' })).toMatchObject({ input: ['audio'], output: ['text'], tools: false, known: true });
    expect(profileOf('gemini', { id: 'gemini-3.8-flash-tts' })).toMatchObject({ input: ['text'], output: ['audio'], known: true });
    expect(profileOf('openai', { id: 'text-embedding-3-small' })).toMatchObject({ output: ['vector'] });
  });

  it('models.dev ranks above name rules', () => {
    catalog({ input: ['text', 'audio'], output: ['text', 'audio'] });
    // "tts" in the id would say text→audio.
    expect(profileOf('openai', { id: 'gpt-4o-mini-tts-chat' })).toMatchObject({ input: ['text', 'audio'], output: ['text', 'audio'] });
  });
});

describe('jobRecords — a job\'s models are only the ones the user added', () => {
  it('lists nothing the user did not add, whatever the provider offers', () => {
    expect(jobRecords([keyed('openai', [])], 'transcribe')).toEqual([]);
    expect(jobRecords([keyed('gemini', [])], 'speak')).toEqual([]);
  });

  it('every added model is named the same way: the user\'s rename, else its id', () => {
    const providers = [{ ...keyed('openai', []), models: [{ id: 'whisper-1', displayName: 'My Whisper' }, { id: 'gpt-4o-transcribe' }] }];
    expect(jobRecords(providers, 'transcribe').map((r) => r.label)).toEqual(['My Whisper', 'gpt-4o-transcribe']);
  });

  it('Gemini\'s transcribe and TTS models added from its list land under their jobs, not chat', () => {
    const providers = [keyed('gemini', ['gemini-3.5-transcribe', 'gemini-3.8-flash-tts'])];
    expect(jobRecords(providers, 'chat').map((r) => r.id)).toEqual([]);
    expect(jobRecords(providers, 'transcribe').map((r) => r.id)).toEqual(['gemini-3.5-transcribe']);
    expect(jobRecords(providers, 'speak').map((r) => r.id)).toEqual(['gemini-3.8-flash-tts']);
  });

  it('an added model is ready once its provider has a key', () => {
    expect(jobRecords([keyed('openai', ['whisper-1'])], 'transcribe')[0]).toMatchObject({ ready: true, hint: null });
  });
});

describe('jobs', () => {
  it('a model fits every job its modalities cover', () => {
    const multimodal = record({ input: ['text', 'audio'], output: ['text'] });
    expect(fitsJob(multimodal, 'chat')).toBe(true);
    expect(fitsJob(multimodal, 'transcribe')).toBe(true);
    expect(fitsJob(multimodal, 'speak')).toBe(false);
  });

  it('speech, voice and image models stay out of chat; unknown models fit nothing', () => {
    const records = [
      record({ id: 'stt', input: ['audio'], output: ['text'] }),
      record({ id: 'tts', input: ['text'], output: ['audio'] }),
      record({ id: 'img', input: ['text', 'image'], output: ['image'] }),
      record({ id: 'chat', input: ['text'], output: ['text'] }),
      record({ id: 'unknown' }),
    ];
    expect(modelsFor(records, 'chat').map((r) => r.id)).toEqual(['chat']);
    expect(modelsFor(records, 'transcribe').map((r) => r.id)).toEqual(['stt']);
    expect(modelsFor(records, 'speak').map((r) => r.id)).toEqual(['tts']);
    expect(modelsFor(records, 'image').map((r) => r.id)).toEqual(['img']);
  });

  it('a model that does not take text in is never a chat model, whatever it outputs', () => {
    expect(fitsJob(record({ input: ['audio'], output: ['text'] }), 'chat')).toBe(false);
    expect(fitsJob(record({ input: ['image'], output: ['text'] }), 'chat')).toBe(false);
    expect(fitsJob(record({ input: ['audio', 'image'], output: ['text', 'audio'] }), 'chat')).toBe(false);
  });

  it('Deepgram Nova is speech, but Amazon Nova chat models are not matched by name', () => {
    expect(profileOf('deepgram', { id: 'nova-3' })).toMatchObject({ input: ['audio'], output: ['text'] });
    expect(profileOf('openrouter', { id: 'amazon/nova-2-lite' })).toMatchObject({ output: ['text'], known: false });
  });

  it('a transcribe variant of a chat family is speech-only', () => {
    expect(profileOf('mistral', { id: 'voxtral-mini-transcribe' })).toMatchObject({ input: ['audio'], output: ['text'] });
  });
});

describe('modelRecords', () => {
  it('one record per active model, labelled by source and ready once a key is set', () => {
    const records = modelRecords([
      keyed('gemini', ['gemini-3.5-transcribe']),
      keyed('openai', ['whisper-1'], ''),
      { ...keyed('groq', ['whisper-large-v3']), active: false },
    ]);
    expect(records.map((r) => [r.provider, r.id, r.source, r.ready])).toEqual([
      ['gemini', 'gemini-3.5-transcribe', 'cloud', true],
      ['openai', 'whisper-1', 'cloud', false],
    ]);
    expect(records[1].hint).toBe('Add OpenAI API key');
  });

  it('names where a model runs', () => {
    expect(modelSourceOf('openai')).toBe('cloud');
    expect(modelSourceOf('on-device')).toBe('on-device');
    expect(modelSourceOf('local:ollama')).toBe('your-server');
    expect(modelSourceOf('apple-intelligence')).toBe('integration');
    expect(modelSourceOf('hex')).toBe('integration');
  });
});

describe('transcribeAdapter — routing from the record', () => {
  it('a speech-only model uses its provider speech endpoint', () => {
    expect(transcribeAdapter(record({ provider: 'openai', input: ['audio'], output: ['text'] }))).toBe('openai-compatible');
    expect(transcribeAdapter(record({ provider: 'deepgram', input: ['audio'], output: ['text'] }))).toBe('deepgram');
    expect(transcribeAdapter(record({ provider: 'on-device', input: ['audio'], output: ['text'] }))).toBe('on-device');
    expect(transcribeAdapter(record({ provider: 'local:ollama', input: ['audio'], output: ['text'] }))).toBe('openai-compatible');
  });

  it('a provider without a speech endpoint, or a model that also chats, goes through the multimodal prompt', () => {
    expect(transcribeAdapter(record({ provider: 'gemini', input: ['audio'], output: ['text'] }))).toBe('multimodal');
    expect(transcribeAdapter(record({ provider: 'openai', input: ['text', 'audio'], output: ['text'] }))).toBe('multimodal');
  });

  it('a model that cannot take audio has no route', () => {
    expect(transcribeAdapter(record({ input: ['text'], output: ['text'] }))).toBeNull();
    expect(transcribeAdapter(record({}))).toBeNull();
  });
});
