/** Model facts (modalities, tools, thinking, context) and pricing from models.dev, cached on disk; Roci's seed describes the
 *  speech providers' models models.dev doesn't list. */

import { exists, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { StorageConfig } from '@config/storage.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { toModalities } from '@services/ai/models/report';
import type { ModelPrice, ModelReport } from '@shared/types/modelProviders';
import { MODEL_SPINE_CONFIG } from '@config/modelSpine.config';
import { MODEL_SEED, type SeedModel } from '@config/modelSeed.config';
import type { ListedModel } from '@services/ai/models/report';

/** A price per 1M tokens, with the cache rates when the catalog states them (cached input costs the input rate otherwise). */
export interface ModelPricing extends ModelPrice {
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

/** A seeded model as the catalog describes its models. */
const asCatalogModel = (model: SeedModel): ModelsDevModel => ({ id: model.id, modalities: model.modalities });

/** The catalog as kept on disk, with when it was fetched. */
interface SavedCatalog {
  fetchedAt: number;
  data: ModelsDevResponse;
}

let loading: Promise<void> | null = null;

const catalogPath = async () => join(await appDataDir(), StorageConfig.modelCatalog.file);

/** A catalog worth keeping: an object with at least one provider; anything else never replaces the one we have. */
const isCatalog = (value: unknown): value is ModelsDevResponse =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;

/** The catalog on disk, or null when there is none or it can't be read. */
async function readSaved(): Promise<SavedCatalog | null> {
  try {
    const path = await catalogPath();
    if (!(await exists(path))) return null;
    const saved = JSON.parse(await readTextFile(path)) as Partial<SavedCatalog>;
    return typeof saved.fetchedAt === 'number' && isCatalog(saved.data) ? (saved as SavedCatalog) : null;
  } catch (error: unknown) {
    console.warn('[ModalitiesService] Saved catalog unreadable, fetching again:', error);
    return null;
  }
}

/** Writes to a temporary name, then renames over the old file, so a half-written catalog is never read. */
async function writeSaved(data: ModelsDevResponse): Promise<void> {
  const path = await catalogPath();
  await writeTextFile(`${path}.tmp`, JSON.stringify({ fetchedAt: Date.now(), data } satisfies SavedCatalog));
  await rename(`${path}.tmp`, path);
}

class ModalitiesService {
  /** Fetches the catalog and keeps it in memory and on disk; false when it couldn't be fetched (the one we have stays). */
  async fetchAndCache(): Promise<boolean> {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        console.error('[ModalitiesService] API request failed:', response.status);
        return false;
      }
      const data: unknown = await response.json();
      if (!isCatalog(data)) {
        console.error('[ModalitiesService] models.dev sent no catalog; keeping the one we have');
        return false;
      }
      cachedData = data;
      await writeSaved(data).catch((error: unknown) => console.warn('[ModalitiesService] Catalog not saved to disk:', error));
      console.log('[ModalitiesService] Fetched the models.dev catalog');
      return true;
    } catch (error: unknown) {
      console.error('[ModalitiesService] Failed to fetch the models.dev catalog:', error);
      return false;
    }
  }

  /** A model's entry: models.dev's, else Roci's seed for the providers models.dev doesn't list. */
  private findModel(providerName: string, modelId: string): ModelsDevModel | null {
    const seeded = MODEL_SEED[providerName]?.[modelId];
    return this.findInCatalog(providerName, modelId) ?? (seeded ? asCatalogModel(seeded) : null);
  }

  /** The seeded models of a provider models.dev doesn't list, as a model list reports them (Add Model offers them). */
  seededModels(providerName: string): ListedModel[] {
    return Object.values(MODEL_SEED[providerName] ?? {}).map((model) => ({ id: model.id, report: reportOf(asCatalogModel(model)) }));
  }

  /** Find the raw model entry from cached data */
  private findInCatalog(providerName: string, modelId: string): ModelsDevModel | null {
    if (!cachedData) return null;

    const modelsDevProviderId = PROVIDER_NAME_MAP[providerName] ?? providerName;
    const provider = cachedData[modelsDevProviderId];
    if (!provider?.models) return null;

    // Try exact match first; a server's cloud model is listed under its name without the cloud ending.
    const exactMatch = provider.models[modelId] ?? provider.models[modelId.replace(MODEL_SPINE_CONFIG.cloudModelSuffix, '')];
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

  /** Loads the saved catalog once (fetching when there is none); an old one is used while a fresh one loads behind it. */
  async ensureLoaded(): Promise<void> {
    if (cachedData) return;
    loading ??= this.load().finally(() => {
      loading = null;
    });
    await loading;
  }

  private async load(): Promise<void> {
    const saved = await readSaved();
    if (!saved) {
      await this.fetchAndCache();
      return;
    }
    cachedData = saved.data;
    if (Date.now() - saved.fetchedAt < StorageConfig.modelCatalog.refreshAfterMs) return;
    void this.fetchAndCache().then((fetched) => {
      if (fetched) void queryClient.invalidateQueries({ queryKey: queryKeys.modelCatalog() });
    });
  }

  isLoaded(): boolean {
    return cachedData !== null;
  }
}

export const modalitiesService = new ModalitiesService();
