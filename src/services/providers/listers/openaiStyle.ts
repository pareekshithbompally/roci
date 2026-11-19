/** OpenAI-style lists (`GET {base}/models`): OpenAI, Anthropic, Groq, Mistral, OpenRouter, vLLM, Jan and any unknown server.
 *  Most give ids only; OpenRouter adds modalities and parameters, Groq a context window. */

import { MODEL_LISTS_CONFIG } from '@config/modelLists.config';
import { toModalities } from '@services/ai/models/report';
import type { ListedModel } from '@services/ai/models/report';
import type { ModelReport } from '@shared/types/modelProviders';
import { asArray, field, getJson, trimmed } from './http';
import type { ModelLister } from './types';

export interface OpenAIEntry {
  id?: string;
  context_length?: number;
  context_window?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
}

/** What one entry states beyond its id. */
export function openAIReport(entry: OpenAIEntry): ModelReport {
  const input = entry.architecture?.input_modalities;
  const output = entry.architecture?.output_modalities;
  const contextTokens = entry.context_length ?? entry.context_window;
  return {
    ...(input && { input: toModalities(input) }),
    ...(output && { output: toModalities(output) }),
    ...(entry.supported_parameters && { tools: entry.supported_parameters.includes('tools') }),
    ...(contextTokens ? { contextTokens } : {}),
  };
}

function openAIEntry(entry: string | OpenAIEntry): ListedModel {
  return typeof entry === 'string' ? { id: entry, report: {} } : { id: entry.id ?? '', report: openAIReport(entry) };
}

/** `{ data: [...] }`, a plain array, or `{ models: [...] }`; entries are ids or objects. */
export function openAIListing(data: unknown): ListedModel[] {
  const entries = Array.isArray(data) ? data : asArray(field(data, 'data') ?? field(data, 'models'));
  return (entries as Array<string | OpenAIEntry>).filter(Boolean).map(openAIEntry).filter((m) => m.id);
}

export const openAIStyleLister: ModelLister = {
  list: async (connection) => openAIListing(await getJson(`${trimmed(connection.baseUrl)}${MODEL_LISTS_CONFIG.paths.openAIModels}`, connection)),
};
