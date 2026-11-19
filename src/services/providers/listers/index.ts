/** Model listing for every provider, cloud or local: pick the lister for the provider's list format, then read the list. */

import { MODEL_LISTS_CONFIG } from '@config/modelLists.config';
import type { ModelListStyle } from '@config/modelLists.config';
import type { ListedModel } from '@services/ai/models/report';
import { isLocalProviderId } from '@shared/utils/provider.utils';
import { geminiLister } from './gemini';
import { llamaServerLister } from './llamaServer';
import { lmStudioLister } from './lmStudio';
import { ollamaLister } from './ollama';
import { openAIStyleLister } from './openaiStyle';
import type { ListConnection, ModelLister } from './types';

const LISTERS: Readonly<Record<ModelListStyle, ModelLister>> = {
  openai: openAIStyleLister,
  gemini: geminiLister,
  ollama: ollamaLister,
  lmstudio: lmStudioLister,
  'llama-server': llamaServerLister,
};

/** Formats detected per server address, so each unknown server is checked once while Roci runs. */
const detectedByUrl = new Map<string, ModelListStyle>();

/** The first detectable format the server answers to, else OpenAI-style. */
async function detect(connection: ListConnection): Promise<ModelListStyle> {
  const { detectable } = MODEL_LISTS_CONFIG;
  const answers = await Promise.all(detectable.map((style) => LISTERS[style].recognises?.(connection) ?? false));
  return detectable[answers.indexOf(true)] ?? 'openai';
}

async function rememberDetected(connection: ListConnection): Promise<ModelListStyle> {
  const style = await detect(connection);
  detectedByUrl.set(connection.baseUrl, style);
  return style;
}

/** The provider's list format: named in config, else (a local server) detected once per address, else OpenAI-style. */
export async function listStyleOf(provider: string, connection: ListConnection): Promise<ModelListStyle> {
  const named = MODEL_LISTS_CONFIG.styleByProvider[provider];
  if (named) return named;
  if (!isLocalProviderId(provider)) return 'openai';
  return detectedByUrl.get(connection.baseUrl) ?? rememberDetected(connection);
}

/** A local server Roci doesn't know by name: its OpenAI-style list must answer first (a stopped server costs one request),
 *  then its format is detected once; a failed list forgets it, since another server may take the address. */
async function listUnnamedServer(connection: ListConnection): Promise<ListedModel[]> {
  const known = detectedByUrl.get(connection.baseUrl);
  if (!known) {
    const openAIList = await openAIStyleLister.list(connection);
    const style = await rememberDetected(connection);
    return style === 'openai' ? openAIList : LISTERS[style].list(connection);
  }
  try {
    return await LISTERS[known].list(connection);
  } catch (error: unknown) {
    detectedByUrl.delete(connection.baseUrl);
    throw error;
  }
}

/** Every model the provider lists, each with what its list says about it. Throws `ListRequestError` when the server refuses. */
export async function listModels(provider: string, connection: ListConnection): Promise<ListedModel[]> {
  const named = MODEL_LISTS_CONFIG.styleByProvider[provider];
  if (named) return LISTERS[named].list(connection);
  return isLocalProviderId(provider) ? listUnnamedServer(connection) : openAIStyleLister.list(connection);
}

export { ListRequestError } from './http';
export type { ListConnection } from './types';
export { geminiListing } from './gemini';
export { lmStudioListing } from './lmStudio';
export { ollamaListing } from './ollama';
export { openAIListing } from './openaiStyle';
