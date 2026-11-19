/** Model facts (modalities, tools, thinking, context) and pricing from models.dev, cached on disk. */

import { cacheService } from './storage/cache.service';
import { toModalities } from '@services/ai/models/report';
import type { ModelReport } from '@shared/types/modelProviders';

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

interface ModelsDevModalities {
  input: string[];
  output: string[];
}

interface ModelsDevLimit {
  context?: number;
  output?: number;
}

interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

interface ModelsDevModel {
  id: string;
  modalities?: ModelsDevModalities;
  tool_call?: boolean;
  reasoning?: boolean;
  structured_output?: boolean;
  attachment?: boolean;
  cost?: ModelsDevCost;
  limit?: ModelsDevLimit;
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
  'local:ollama': 'ollama-cloud',
  'local:lmstudio': 'lmstudio',
};

let cachedData: ModelsDevResponse | null = null;

/** Catalog sections searched first when a model is matched by a similar name: the labs that make the models, then hosts. */
const ORIGIN_PROVIDERS = ['google', 'openai', 'anthropic', 'mistral', 'meta', 'alibaba', 'deepseek', 'nvidia', 'ollama-cloud', 'lmstudio'];

/** Packaging a served model's name carries that its catalog name doesn't: quant, file format, chat tuning, tag. */
const PACKAGING_SUFFIX = /[-_:](?:gguf|mlx|q\d\w*|iq\d\w*|bf16|fp16|f16|fp8|nvfp4|\d+bit|it|instruct|chat|latest|cloud)$/;

/** A model name without host, org, tag and packaging, letters and digits only: `hf.co/org/Gemma-4-31B-it-GGUF:Q4_K_M` and `gemma4:31b-cloud` → `gemma431b`. */
export function nameKey(id: string): string {
  let name = id.toLowerCase().split('/').pop() ?? '';
  let stripped = name.replace(PACKAGING_SUFFIX, '');
  while (stripped !== name) {
    name = stripped;
    stripped = name.replace(PACKAGING_SUFFIX, '');
  }
  return name.replace(/[^a-z0-9]/g, '');
}

let nameIndex: { data: ModelsDevResponse; byKey: Map<string, ModelsDevModel> } | null = null;

/** Every catalog model by its name key, origin labs first so their entry wins; built once per catalog load. */
function modelsByNameKey(data: ModelsDevResponse): Map<string, ModelsDevModel> {
  if (nameIndex?.data === data) return nameIndex.byKey;
  const order = [...ORIGIN_PROVIDERS, ...Object.keys(data).filter((id) => !ORIGIN_PROVIDERS.includes(id))];
  const byKey = new Map<string, ModelsDevModel>();
  for (const providerId of order) {
    for (const [modelId, model] of Object.entries(data[providerId]?.models ?? {})) {
      const key = nameKey(modelId);
      if (key && !byKey.has(key)) byKey.set(key, model);
    }
  }
  nameIndex = { data, byKey };
  return byKey;
}

/** What a catalog entry states, in the shape every source reports. */
function reportOf(model: ModelsDevModel): ModelReport {
  return {
    ...(model.modalities && { input: toModalities(model.modalities.input), output: toModalities(model.modalities.output) }),
    ...(model.tool_call !== undefined && { tools: model.tool_call }),
    ...(model.reasoning !== undefined && { reasoning: model.reasoning }),
    ...(model.limit?.context ? { contextTokens: model.limit.context } : {}),
  };
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

  /** What the catalog says about a model: its own entry (`exact`), else one with a similar name; null when neither. */
  catalogReport(providerName: string, modelId: string): { report: ModelReport; exact: boolean } | null {
    const exact = this.findModel(providerName, modelId);
    if (exact) return { report: reportOf(exact), exact: true };
    const similar = cachedData && modelsByNameKey(cachedData).get(nameKey(modelId));
    return similar ? { report: reportOf(similar), exact: false } : null;
  }

  /** Pricing from models.dev cost data; null when the model or its cost is missing. */
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
