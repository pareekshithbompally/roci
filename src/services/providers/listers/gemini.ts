/** Gemini's list (`GET {base}/models?key=…`): a context window per model, and its methods say embedding or image models. */

import { MODEL_LISTS_CONFIG } from '@config/modelLists.config';
import type { ListedModel } from '@services/ai/models/report';
import type { ModelReport } from '@shared/types/modelProviders';
import { asArray, field, getJson, trimmed } from './http';
import type { ModelLister } from './types';

interface GeminiEntry {
  name?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

/** Only what a model's methods imply: embedding (embedContent) or image (predict); generateContent says nothing. */
function geminiModalities(methods: string[]): Pick<ModelReport, 'input' | 'output'> {
  if (methods.includes('generateContent')) return {};
  if (methods.includes('embedContent')) return { input: ['text'], output: ['vector'] };
  if (methods.includes('predict')) return { input: ['text'], output: ['image'] };
  return {};
}

function geminiEntry(entry: GeminiEntry): ListedModel {
  return {
    id: (entry.name ?? '').replace(/^models\//, ''),
    report: { ...(entry.inputTokenLimit ? { contextTokens: entry.inputTokenLimit } : {}), ...geminiModalities(entry.supportedGenerationMethods ?? []) },
  };
}

/** `{ models: [{ name: "models/…", inputTokenLimit, supportedGenerationMethods }] }`. */
export function geminiListing(data: unknown): ListedModel[] {
  return asArray<GeminiEntry>(field(data, 'models')).map(geminiEntry).filter((m) => m.id);
}

export const geminiLister: ModelLister = {
  list: async (connection) => {
    const query = new URLSearchParams({ pageSize: String(MODEL_LISTS_CONFIG.geminiPageSize), key: connection.apiKey ?? '' });
    // The key travels in the query; Google refuses a Bearer header that isn't an OAuth token.
    return geminiListing(await getJson(`${trimmed(connection.baseUrl)}${MODEL_LISTS_CONFIG.paths.openAIModels}?${query}`, { signal: connection.signal }));
  },
};
