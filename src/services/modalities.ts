/**
 * Modalities Service
 *
 * Fetches and caches model capability data from the models.dev API.
 * Provides lookup of input/output modalities and feature capabilities
 * (tool calling, reasoning, structured output) for any provider + model.
 *
 * Cache is stored on disk via cacheService in the app data directory.
 */

import { cacheService } from './storage/cache.service';

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

/** Token limits reported by models.dev */
export interface ModelContextLimit {
  /** Maximum context window in tokens */
  context?: number;
  /** Maximum output tokens */
  output?: number;
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
  limit?: ModelContextLimit;
  [key: string]: unknown;
}

interface ModelsDevProvider {
  id: string;
  name: string;
  models: Record<string, ModelsDevModel>;
}

type ModelsDevResponse = Record<string, ModelsDevProvider>;

const API_URL = 'https://models.dev/api.json';
const CACHE_KEY = 'modalities';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const PROVIDER_NAME_MAP: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  openrouter: 'openrouter',
  mistral: 'mistral',
  groq: 'groq',
  gemini: 'google',
};

let cachedData: ModelsDevResponse | null = null;

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
      try {
        await cacheService.set(CACHE_KEY, data, CACHE_TTL_MS, 'api');
      } catch {
        console.warn('[ModalitiesService] Disk cache write failed, using in-memory cache only');
      }
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

  /**
   * Get the context window size (in tokens) for a provider + model.
   * Returns null when the model isn't found or reports no limit —
   * callers treat null as "unknown, hide the gauge".
   */
  getModelContextLimit(providerName: string, modelId: string): number | null {
    return this.findModel(providerName, modelId)?.limit?.context ?? null;
  }

  async ensureLoaded(): Promise<void> {
    if (cachedData) return;

    // Try loading from disk cache
    try {
      const result = await cacheService.get<ModelsDevResponse>(CACHE_KEY, 'api');
      if (result.success && result.data) {
        cachedData = result.data;
        return;
      }
    } catch {
      // Disk cache unavailable, proceed to fetch
    }

    await this.fetchAndCache();
  }

  isLoaded(): boolean {
    return cachedData !== null;
  }
}

export const modalitiesService = new ModalitiesService();
