import { describe, it, expect } from 'vitest';
import { geminiListing, ollamaListing, openAIListing } from '@services/providers/listers';
import { mergeReports, withReports } from '@services/ai/models';

describe('geminiListing', () => {
  it('keeps the context window and reads embedding and image models from their methods', () => {
    expect(geminiListing({
      models: [
        { name: 'models/gemini-3.5-flash', inputTokenLimit: 1_048_576, supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/gemini-embedding-001', inputTokenLimit: 2048, supportedGenerationMethods: ['embedContent'] },
        { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
      ],
    })).toEqual([
      { id: 'gemini-3.5-flash', report: { contextTokens: 1_048_576 } },
      { id: 'gemini-embedding-001', report: { contextTokens: 2048, input: ['text'], output: ['vector'] } },
      { id: 'imagen-4.0-generate-001', report: { input: ['text'], output: ['image'] } },
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
      report: { input: ['text'], output: ['audio'], tools: false, contextTokens: 32_000 },
    }]);
  });

  it('a bare id list (OpenAI) carries ids only; Groq context_window is kept', () => {
    expect(openAIListing({ data: [{ id: 'gpt-5' }, { id: 'llama-4', context_window: 131_072 }] })).toEqual([
      { id: 'gpt-5', report: {} },
      { id: 'llama-4', report: { contextTokens: 131_072 } },
    ]);
  });

  it('accepts the plain array and { models } shapes', () => {
    expect(openAIListing(['a', { id: 'b' }])).toEqual([{ id: 'a', report: {} }, { id: 'b', report: {} }]);
    expect(openAIListing({ models: ['c'] })).toEqual([{ id: 'c', report: {} }]);
  });
});

describe('ollamaListing', () => {
  it('reads each model\'s capabilities and context window from /api/tags', () => {
    expect(ollamaListing({
      models: [
        { name: 'gemma4:31b-cloud', capabilities: ['completion', 'thinking', 'tools', 'vision'], details: { context_length: 262_144 } },
        { name: 'nomic-embed-text', capabilities: ['embedding'] },
        { name: 'old-model' },
      ],
    })).toEqual([
      { id: 'gemma4:31b-cloud', report: { input: ['text', 'image'], output: ['text'], tools: true, reasoning: true, contextTokens: 262_144 } },
      { id: 'nomic-embed-text', report: { input: ['text'], output: ['vector'], tools: false, reasoning: false } },
      { id: 'old-model', report: {} },
    ]);
  });
});

describe('withReports', () => {
  it('saves what the listing says onto saved models, and leaves unlisted ones alone', () => {
    const saved = [{ id: 'a', name: 'A' }, { id: 'b' }];
    expect(withReports(saved, [{ id: 'a', report: { contextTokens: 10 } }])).toEqual([{ id: 'a', name: 'A', reported: { contextTokens: 10 } }, { id: 'b' }]);
  });

  it('returns the same array when the list says nothing new, so no save is made', () => {
    const saved = [{ id: 'a', reported: { contextTokens: 10 } }];
    expect(withReports(saved, [{ id: 'a', report: {} }])).toBe(saved);
    expect(withReports(saved, [{ id: 'a', report: { contextTokens: 10 } }])).toBe(saved);
  });
});

describe('mergeReports', () => {
  it('keeps what a fresh report leaves unset (tools learned while a llama-server model was loaded)', () => {
    expect(mergeReports({ contextTokens: 8, tools: true, reasoning: false }, { contextTokens: 16 })).toEqual({ contextTokens: 16, tools: true, reasoning: false });
  });

  it('takes what the report states now over what was known before', () => {
    expect(mergeReports({ tools: true, reasoning: true }, { tools: false, reasoning: false })).toEqual({ tools: false, reasoning: false });
  });
});
