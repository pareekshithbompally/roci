/** llama-server's list (`GET {base}/models`, router mode): OpenAI-style entries plus each model's running context and load
 *  state; a loaded model's chat template also says whether it takes tools and thinks. */

import { MODEL_LISTS_CONFIG } from '@config/modelLists.config';
import { fetchTemplateCapabilities, isLlamaServer } from '@services/ai/llamaServer';
import type { ListedModel } from '@services/ai/models/report';
import { failureLogger } from '@shared/utils/errors';
import { asArray, field, getJson, trimmed } from './http';
import { openAIReport } from './openaiStyle';
import type { OpenAIEntry } from './openaiStyle';
import type { ModelLister } from './types';

const logFailure = failureLogger('llamaServerLister');

interface LlamaEntry extends OpenAIEntry {
  status?: { value?: string; preset?: string };
}

/** The `ctx-size = N` line of a model's preset: the context it actually runs with. */
const presetContext = (preset: string | undefined) => Number(preset?.match(/^ctx-size\s*=\s*(\d+)\s*$/m)?.[1]) || undefined;

function llamaEntry(entry: LlamaEntry): ListedModel {
  const contextTokens = presetContext(entry.status?.preset);
  return {
    id: entry.id ?? '',
    report: { ...openAIReport(entry), ...(contextTokens ? { contextTokens } : {}) },
    loaded: entry.status?.value === 'loaded',
  };
}

/** A loaded model with what its chat template can do; an unloaded one as listed (asking would load it). */
async function withTemplateCapabilities(baseUrl: string, model: ListedModel): Promise<ListedModel> {
  if (!model.loaded) return model;
  const capabilities = await fetchTemplateCapabilities(baseUrl, model.id).catch((error: unknown) => {
    logFailure('read model capabilities')(error);
    return null;
  });
  return capabilities ? { ...model, report: { ...model.report, ...capabilities } } : model;
}

export const llamaServerLister: ModelLister = {
  recognises: ({ baseUrl }) => isLlamaServer(baseUrl),
  list: async (connection) => {
    const data = await getJson(`${trimmed(connection.baseUrl)}${MODEL_LISTS_CONFIG.paths.openAIModels}`, connection);
    const models = asArray<LlamaEntry>(field(data, 'data')).map(llamaEntry).filter((m) => m.id);
    return Promise.all(models.map((model) => withTemplateCapabilities(connection.baseUrl, model)));
  },
};
