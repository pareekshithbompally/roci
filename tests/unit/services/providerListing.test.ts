import { describe, it, expect } from 'vitest';
import { geminiListing, openAIListing, withListedInfo } from '@services/providers/listing';

describe('geminiListing', () => {
  it('keeps the context window and reads embedding and image models from their methods', () => {
    expect(geminiListing({
      models: [
        { name: 'models/gemini-3.5-flash', inputTokenLimit: 1_048_576, supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/gemini-embedding-001', inputTokenLimit: 2048, supportedGenerationMethods: ['embedContent'] },
        { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
      ],
    })).toEqual([
      { id: 'gemini-3.5-flash', info: { contextTokens: 1_048_576 } },
      { id: 'gemini-embedding-001', info: { contextTokens: 2048, modalities: { input: ['text'], output: ['vector'] } } },
      { id: 'imagen-4.0-generate-001', info: { modalities: { input: ['text'], output: ['image'] } } },
    ]);
  });

  it('an empty or odd response lists nothing', () => {
    expect(geminiListing({})).toEqual([]);
    expect(geminiListing(null)).toEqual([]);
  });
});

describe('openAIListing', () => {
  it('reads OpenRouter modalities, tool support and context length', () => {
    expect(openAIListing({
      data: [{
        id: 'google/gemini-3.8-flash-tts',
        context_length: 32_000,
        architecture: { input_modalities: ['text'], output_modalities: ['audio'] },
        supported_parameters: ['temperature'],
      }],
    })).toEqual([{
      id: 'google/gemini-3.8-flash-tts',
      info: { modalities: { input: ['text'], output: ['audio'] }, tools: false, contextTokens: 32_000 },
    }]);
  });

  it('a bare id list (OpenAI) carries ids only; Groq context_window is kept', () => {
    expect(openAIListing({ data: [{ id: 'gpt-5' }, { id: 'llama-4', context_window: 131_072 }] })).toEqual([
      { id: 'gpt-5', info: {} },
      { id: 'llama-4', info: { contextTokens: 131_072 } },
    ]);
  });

  it('accepts the plain array and { models } shapes', () => {
    expect(openAIListing(['a', { id: 'b' }])).toEqual([{ id: 'a', info: {} }, { id: 'b', info: {} }]);
    expect(openAIListing({ models: ['c'] })).toEqual([{ id: 'c', info: {} }]);
  });
});

describe('withListedInfo', () => {
  it('saves what the listing says onto saved models, and leaves unlisted ones alone', () => {
    const saved = [{ id: 'a', name: 'A' }, { id: 'b' }];
    const listing = [{ id: 'a', info: { contextTokens: 10 } }];
    expect(withListedInfo(saved, listing)).toEqual([{ id: 'a', name: 'A', listed: { contextTokens: 10 } }, { id: 'b' }]);
  });

  it('a bare id says nothing, so nothing is saved for it', () => {
    const saved = [{ id: 'a' }];
    expect(withListedInfo(saved, [{ id: 'a', info: {} }])).toBe(saved);
  });

  it('returns the same array when nothing changes, so no save is made', () => {
    const saved = [{ id: 'a', listed: { contextTokens: 10 } }];
    expect(withListedInfo(saved, [{ id: 'a', info: { contextTokens: 10 } }])).toBe(saved);
  });
});
