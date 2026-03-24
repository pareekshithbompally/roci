/**
 * Modalities Service
 *
 * Fetches and caches model capability data from the models.dev API.
 * Provides lookup of input/output modalities and feature capabilities
 * (tool calling, reasoning, structured output) for any provider + model.
 */

export interface ModelModalities {
  input: string[];
  output: string[];
}

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPer1M: number;
  /** USD per 1M output tokens */
  outputPer1M: number;
  /** USD per 1M cached input tokens (read from cache) */
  cacheReadPer1M?: number;
  /** USD per 1M cache write tokens */
  cacheWritePer1M?: number;
}

/** Boolean capabilities reported by models.dev */
export interface ModelCapabilities {
  toolCall?: boolean;
  reasoning?: boolean;
  structuredOutput?: boolean;
  attachment?: boolean;
}

/** Combined modality + capability info for a model. Reusable across all UI surfaces. */
export interface ModelInfo {
  modalities: ModelModalities | null;
  capabilities: ModelCapabilities;
}

interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

interface ModelsDevModel {
  id: string;
  modalities?: ModelModalities;
  tool_call?: boolean;
  reasoning?: boolean;
  structured_output?: boolean;
  attachment?: boolean;
  cost?: ModelsDevCost;
  [key: string]: unknown;
}

interface ModelsDevProvider {
  id: string;
  name: string;
  models: Record<string, ModelsDevModel>;
}

type ModelsDevResponse = Record<string, ModelsDevProvider>;

const API_URL = 'https://models.dev/api.json';
const CACHE_KEY = 'kasset_modalities_cache';
const CACHE_TS_KEY = 'kasset_modalities_cache_ts';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const PROVIDER_NAME_MAP: Record<string, string> = {
  openai: 'openai',
  azure: 'azure',
  anthropic: 'anthropic',
  cohere: 'cohere',
  openrouter: 'openrouter',
  mistral: 'mistral',
  groq: 'groq',
  gemini: 'google',
  huggingface: 'huggingface',
  xai: 'xai',
};

let cachedData: ModelsDevResponse | null = null;

function isCacheExpired(): boolean {
  const ts = localStorage.getItem(CACHE_TS_KEY);
  if (!ts) return true;
  return Date.now() - Number(ts) > CACHE_TTL_MS;
}

function loadFromLocalStorage(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    cachedData = JSON.parse(raw) as ModelsDevResponse;
    return true;
  } catch (error: unknown) {
    console.error('[ModalitiesService] Failed to load from localStorage:', error);
    return false;
  }
}

class ModalitiesService {
  async fetchAndCache(): Promise<void> {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        console.error('[ModalitiesService] API request failed:', response.status);
        return;
      }
      const data = (await response.json()) as ModelsDevResponse;
      cachedData = data;
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
      console.log('[ModalitiesService] Fetched and cached modality data');
    } catch (error: unknown) {
      console.error('[ModalitiesService] Failed to fetch modality data:', error);
    }
  }

  /** Find the raw model entry from cached data */
  private findModel(providerName: string, modelId: string): ModelsDevModel | null {
    if (!cachedData) return null;

    const modelsDevProviderId = PROVIDER_NAME_MAP[providerName] ?? providerName;
    const provider = cachedData[modelsDevProviderId];
    if (!provider?.models) return null;

    // Try exact match first
    const exactMatch = provider.models[modelId];
    if (exactMatch) return exactMatch;

    // Try stripping provider prefix (e.g., "openai/gpt-5" → "gpt-5")
    for (const model of Object.values(provider.models)) {
      const slashIndex = model.id.indexOf('/');
      if (slashIndex !== -1 && model.id.slice(slashIndex + 1) === modelId) {
        return model;
      }
    }

    return null;
  }

  /** @deprecated Use getModelInfo() instead for full capability data */
  getModalities(providerName: string, modelId: string): ModelModalities | null {
    return this.findModel(providerName, modelId)?.modalities ?? null;
  }

  /**
   * Get combined modality + capability info for a model.
   * Returns null if the model isn't found in the models.dev data.
   */
  getModelInfo(providerName: string, modelId: string): ModelInfo | null {
    const model = this.findModel(providerName, modelId);
    if (!model) return null;

    return {
      modalities: model.modalities ?? null,
      capabilities: {
        toolCall: model.tool_call,
        reasoning: model.reasoning,
        structuredOutput: model.structured_output,
        attachment: model.attachment,
      },
    };
  }

  /**
   * Get pricing for a provider + model from models.dev cost data.
   * Returns null if the model isn't found or has no cost data.
   */
  getPricing(providerName: string, modelId: string): ModelPricing | null {
    const model = this.findModel(providerName, modelId);
    if (!model?.cost?.input || !model?.cost?.output) return null;
    return {
      inputPer1M: model.cost.input,
      outputPer1M: model.cost.output,
      cacheReadPer1M: model.cost.cache_read,
      cacheWritePer1M: model.cost.cache_write,
    };
  }

  async ensureLoaded(): Promise<void> {
    if (cachedData) return;

    if (!isCacheExpired() && loadFromLocalStorage()) return;

    await this.fetchAndCache();
  }

  isLoaded(): boolean {
    return cachedData !== null;
  }
}

export const modalitiesService = new ModalitiesService();
