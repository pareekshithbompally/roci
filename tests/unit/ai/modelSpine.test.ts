import { describe, it, expect, vi, beforeEach } from 'vitest';

const getModelInfo = vi.hoisted(() => vi.fn());
const getModelContextLimit = vi.hoisted(() => vi.fn());
vi.mock('@services/modalities', () => ({ modalitiesService: { getModelInfo, getModelContextLimit } }));

import { describeModel, fitsJob, jobRecords, modelRecords, modelsFor, modelSourceOf, transcribeAdapter } from '@services/ai/models';
import type { ModelRecord } from '@services/ai/models';
import type { ModelProvider } from '@shared/types/modelProviders';

const keyed = (provider: string, ids: string[], apiKey = 'k'): ModelProvider => ({
  provider,
  active: true,
  api_key: apiKey,
  settings: [],
  models: ids.map((id) => ({ id })),
});

const record = (over: Partial<ModelRecord>): ModelRecord => ({
  provider: 'openai', id: 'm', label: 'm', source: 'cloud', input: [], output: [],
  tools: false, reasoning: false, contextTokens: null, known: false, ready: true, hint: null, ...over,
});

beforeEach(() => {
  getModelInfo.mockReset().mockReturnValue(null);
  getModelContextLimit.mockReset().mockReturnValue(null);
});

describe('describeModel — first fact wins', () => {
  it('an unknown model on a language-model provider is assumed to chat, never with tools', () => {
    expect(describeModel('gemini', { id: 'mystery-1' })).toEqual({
      input: ['text'], output: ['text'], tools: false, reasoning: false, contextTokens: null, known: false,
    });
  });

  it('an unknown model on a speech provider is assumed to transcribe', () => {
    expect(describeModel('deepgram', { id: 'whatever' })).toMatchObject({ input: ['audio'], output: ['text'], known: false });
  });

  it('the user\'s Audio input tick adds or removes audio from what the sources say', () => {
    getModelInfo.mockReturnValue({ modalities: { input: ['text'], output: ['text'] }, capabilities: {} });
    expect(describeModel('openrouter', { id: 'm', audioInput: true }).input).toEqual(['text', 'audio']);
    getModelInfo.mockReturnValue({ modalities: { input: ['text', 'audio'], output: ['text'] }, capabilities: {} });
    expect(describeModel('openrouter', { id: 'm', audioInput: false }).input).toEqual(['text']);
  });

  it('models.dev describes a model, dropping modalities Roci does not use', () => {
    getModelInfo.mockReturnValue({ modalities: { input: ['text', 'image', 'pdf'], output: ['text'] }, capabilities: { toolCall: true, reasoning: true } });
    getModelContextLimit.mockReturnValue(200_000);
    expect(describeModel('anthropic', { id: 'claude' })).toEqual({
      input: ['text', 'image'], output: ['text'], tools: true, reasoning: true, contextTokens: 200_000, known: true,
    });
  });

  it('what its own server reports beats models.dev', () => {
    getModelInfo.mockReturnValue({ modalities: { input: ['text'], output: ['text'] }, capabilities: { toolCall: false } });
    const served = { modalities: { input: ['text', 'audio'], output: ['text'] }, tools: true, thinking: true, contextTokens: 32_768 };
    expect(describeModel('local:127.0.0.1:9931', { id: 'lfm', served })).toEqual({
      input: ['text', 'audio'], output: ['text'], tools: true, reasoning: true, contextTokens: 32_768, known: true,
    });
  });

  it('the provider listing ranks below its own server and above models.dev', () => {
    getModelInfo.mockReturnValue({ modalities: { input: ['text'], output: ['text'] }, capabilities: { toolCall: true } });
    const listed = { modalities: { input: ['text'], output: ['audio'] }, tools: false, contextTokens: 32_000 };
    expect(describeModel('openrouter', { id: 'google/gemini-tts', listed })).toMatchObject({
      input: ['text'], output: ['audio'], tools: false, contextTokens: 32_000,
    });
    const served = { modalities: { input: ['text'], output: ['text'] } };
    expect(describeModel('local:x', { id: 'm', listed, served })).toMatchObject({ output: ['text'], tools: false });
  });

  it('the user turning tools off beats every other fact', () => {
    getModelInfo.mockReturnValue({ modalities: { input: ['text'], output: ['text'] }, capabilities: { toolCall: true } });
    expect(describeModel('openai', { id: 'gpt', toolsEnabled: false }).tools).toBe(false);
  });

  it('name rules describe a model nothing else knows, without granting tools', () => {
    expect(describeModel('gemini', { id: 'gemini-3.5-transcribe' })).toMatchObject({ input: ['audio'], output: ['text'], tools: false, known: true });
    expect(describeModel('gemini', { id: 'gemini-3.8-flash-tts' })).toMatchObject({ input: ['text'], output: ['audio'], known: true });
    expect(describeModel('openai', { id: 'text-embedding-3-small' })).toMatchObject({ output: ['vector'] });
  });

  it('a modality pair is taken whole from one source, never mixed', () => {
    getModelInfo.mockReturnValue({ modalities: { input: ['text', 'audio'], output: ['text', 'audio'] }, capabilities: {} });
    // "tts" in the id would say text→audio; models.dev ranks above name rules.
    expect(describeModel('openai', { id: 'gpt-4o-mini-tts-chat' })).toMatchObject({ input: ['text', 'audio'], output: ['text', 'audio'] });
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
    expect(describeModel('deepgram', { id: 'nova-3' })).toMatchObject({ input: ['audio'], output: ['text'] });
    expect(describeModel('openrouter', { id: 'amazon/nova-2-lite' })).toMatchObject({ output: ['text'], known: false });
  });

  it('a transcribe variant of a chat family is speech-only', () => {
    expect(describeModel('mistral', { id: 'voxtral-mini-transcribe' })).toMatchObject({ input: ['audio'], output: ['text'] });
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
