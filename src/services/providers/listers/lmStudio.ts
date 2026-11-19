/** LM Studio's own list (`GET /api/v0/models`): each model's type (llm, vlm, embeddings), tool use, context and load state. */

import { MODEL_LISTS_CONFIG } from '@config/modelLists.config';
import type { ListedModel } from '@services/ai/models/report';
import type { ModelReport } from '@shared/types/modelProviders';
import { answers, asArray, field, getJson, rootOf } from './http';
import type { ModelLister } from './types';

interface LmStudioEntry {
  id?: string;
  type?: string;
  state?: string;
  max_context_length?: number;
  loaded_context_length?: number;
  capabilities?: string[];
}

/** A vision model (`vlm`) also takes images; an `embeddings` model gives vectors. */
function typeReport(type: string | undefined): Pick<ModelReport, 'input' | 'output'> {
  if (!type) return {};
  return { input: type === 'vlm' ? ['text', 'image'] : ['text'], output: type === 'embeddings' ? ['vector'] : ['text'] };
}

function lmStudioReport(entry: LmStudioEntry): ModelReport {
  const contextTokens = entry.loaded_context_length ?? entry.max_context_length;
  return {
    ...typeReport(entry.type),
    ...(entry.capabilities && { tools: entry.capabilities.includes('tool_use') }),
    ...(contextTokens ? { contextTokens } : {}),
  };
}

/** `{ data: [{ id, type, state, max_context_length, loaded_context_length, capabilities }] }`. */
export function lmStudioListing(data: unknown): ListedModel[] {
  return asArray<LmStudioEntry>(field(data, 'data'))
    .map((entry) => ({ id: entry.id ?? '', report: lmStudioReport(entry), loaded: entry.state === 'loaded' }))
    .filter((m) => m.id);
}

const modelsUrl = (baseUrl: string) => `${rootOf(baseUrl)}${MODEL_LISTS_CONFIG.paths.lmStudioModels}`;

export const lmStudioLister: ModelLister = {
  recognises: (connection) => answers(modelsUrl(connection.baseUrl), connection),
  list: async (connection) => lmStudioListing(await getJson(modelsUrl(connection.baseUrl), connection)),
};
