/** Ollama's own list (`GET /api/tags`): every model with its capabilities and context window, in one request. */

import { MODEL_LISTS_CONFIG } from '@config/modelLists.config';
import type { Modality } from '@config/modelSpine.config';
import type { ListedModel } from '@services/ai/models/report';
import type { ModelReport } from '@shared/types/modelProviders';
import { answers, asArray, field, getJson, rootOf } from './http';
import type { ModelLister } from './types';

interface OllamaTag {
  name?: string;
  capabilities?: string[];
  details?: { context_length?: number };
}

/** Inputs an Ollama capability adds to text. */
const INPUT_BY_CAPABILITY: Readonly<Record<string, Modality>> = { vision: 'image', audio: 'audio' };

function capabilityReport(capabilities: string[]): ModelReport {
  const embedsOnly = capabilities.includes('embedding') && !capabilities.includes('completion');
  return {
    input: ['text', ...capabilities.flatMap((c) => INPUT_BY_CAPABILITY[c] ?? [])],
    output: [embedsOnly ? 'vector' : 'text'],
    tools: capabilities.includes('tools'),
    reasoning: capabilities.includes('thinking'),
  };
}

function ollamaEntry(tag: OllamaTag): ListedModel {
  const contextTokens = tag.details?.context_length;
  return {
    id: tag.name ?? '',
    report: { ...(tag.capabilities && capabilityReport(tag.capabilities)), ...(contextTokens ? { contextTokens } : {}) },
  };
}

/** `{ models: [{ name, capabilities: ["completion", "vision", "tools", "thinking"], details: { context_length } }] }`. */
export function ollamaListing(data: unknown): ListedModel[] {
  return asArray<OllamaTag>(field(data, 'models')).map(ollamaEntry).filter((m) => m.id);
}

export const ollamaLister: ModelLister = {
  recognises: (connection) => answers(`${rootOf(connection.baseUrl)}${MODEL_LISTS_CONFIG.paths.ollamaVersion}`, connection),
  list: async (connection) => ollamaListing(await getJson(`${rootOf(connection.baseUrl)}${MODEL_LISTS_CONFIG.paths.ollamaTags}`, connection)),
};
