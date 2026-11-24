/** Resolves a model id to its provider and configuration for routing API calls. */

import type { ModelProvider, Model } from '@shared/types/modelProviders';
import type { ProviderType } from '@services/ai/types';
import { MANAGED_SDK_PROVIDERS, MANAGED_DEFAULT_URLS, APPLE_INTELLIGENCE } from '@config/providers.config';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import type { AppSettings } from '@shared/types';
import { getProviderTitle } from '@shared/utils/provider.utils';
import type { LucideIcon } from 'lucide-react';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import type { LocalModel } from '@services/localModels.service';
import { modelKey, parseModelKey } from '@services/ai/models/keys';
import type { ModelProfile, ModelRef } from '@services/ai/models';

const ON_DEVICE = LOCAL_MODELS_CONFIG.provider.id;

export interface ResolvedModel {
  modelId: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: Model;
  providerConfig: ModelProvider;
}

/** A provider's API key and base URL: the settings rows win over the stored fields. */
export function providerCredentials(provider: ModelProvider): { apiKey: string; baseUrl: string } {
  const valueOf = (key: string) => provider.settings.find(s => s.key === key)?.controller_props.value as string | undefined;
  return {
    apiKey: valueOf('api-key') || provider.api_key || '',
    baseUrl: valueOf('base-url') || provider.base_url || '',
  };
}

/** A saved selection (`provider::model`) resolved on its own provider; null when that provider is off or no longer lists it. */
export function resolveModel(
  key: string | undefined,
  providers: ModelProvider[]
): ResolvedModel | null {
  const ref = key ? parseModelKey(key) : null;
  const provider = ref && providers.find((p) => p.active && p.provider === ref.provider);
  const model = provider?.models?.find((m) => m.id === ref?.model);
  if (!provider || !model) return null;
  return { modelId: model.id, provider: provider.provider, ...providerCredentials(provider), model, providerConfig: provider };
}

/** A selection saved as a bare model id becomes its key, on the provider that id ran on: the first active one listing it. */
export function keyedSelection(value: string, providers: ModelProvider[]): string {
  if (parseModelKey(value)) return value;
  const provider = providers.find((p) => p.active && p.models?.some((m) => m.id === value));
  return provider ? modelKey({ provider: provider.provider, model: value }) : value;
}

/** A model on one named provider (provider + model selections); the model need not be in the provider's list. */
export function resolveProviderModel(
  providerId: string,
  modelId: string,
  providers: ModelProvider[]
): ResolvedModel | null {
  const provider = providers.find(p => p.active && p.provider === providerId);
  if (!provider || !modelId) return null;
  const { apiKey, baseUrl } = providerCredentials(provider);
  return {
    modelId,
    provider: providerId,
    apiKey,
    baseUrl: baseUrl || getDefaultBaseUrl(providerId) || '',
    model: provider.models?.find(m => m.id === modelId) ?? { id: modelId },
    providerConfig: provider,
  };
}

/** Adapter type: gemini | anthropic | openai | mistral | groq | openai-compat. */
export function getProviderType(provider: string): ProviderType {
  if (provider === APPLE_INTELLIGENCE.provider) return 'apple-intelligence';
  if (provider === ON_DEVICE) return 'on-device';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'openai') return 'openai';
  if (provider === 'mistral') return 'mistral';
  if (provider === 'groq') return 'groq';
  return 'openai-compat';
}

/** Whether a provider uses a native SDK (no user-configurable base URL) */
export function isManagedSDK(provider: string): boolean {
  return MANAGED_SDK_PROVIDERS.has(provider);
}

/** Whether Roci can list the provider's models (and so test its key): a managed SDK, or a base URL to call. */
export function canListModels(provider: ModelProvider): boolean {
  return isManagedSDK(provider.provider) || provider.settings.some((s) => s.key === 'base-url');
}

/** Default base URL for managed providers (used only for model listing) */
export function getDefaultBaseUrl(provider: string): string | null {
  return MANAGED_DEFAULT_URLS[provider] ?? null;
}

/** Apple Intelligence as a provider entry (no key, one model). */
const APPLE_INTELLIGENCE_PROVIDER: ModelProvider = {
  provider: APPLE_INTELLIGENCE.provider,
  active: true,
  settings: [],
  models: [{ id: APPLE_INTELLIGENCE.model, name: APPLE_INTELLIGENCE.name }],
};

/** The local models as last loaded: settings load them first, every download and delete refreshes them. */
export function cachedLocalModels(): LocalModel[] {
  return queryClient.getQueryData<LocalModel[]>(queryKeys.localModels()) ?? [];
}


/** A downloaded chat model as a provider's model; it reports what it can do, as a server does: tool calling from its
 *  chat template, images when it ships a vision encoder, the context window from its config. */
export function onDeviceChatModel(m: LocalModel): Model {
  return {
    id: m.id,
    name: m.name,
    reported: {
      input: m.vision ? ['text', 'image'] : ['text'],
      output: ['text'],
      tools: m.tools ?? false,
      ...(m.contextTokens ? { contextTokens: m.contextTokens } : {}),
    },
  };
}

/** Chat models downloaded to this device as one provider entry (no key). */
function onDeviceChatProvider(localModels: LocalModel[], include = (m: LocalModel) => m.installed): ModelProvider | null {
  const models = localModels.filter((m) => m.kind === 'chat' && include(m)).map(onDeviceChatModel);
  return models.length > 0 ? { provider: ON_DEVICE, active: true, settings: [], models } : null;
}

/** Every model source: providers, Apple Intelligence while on, chat models on this device (pickers pass live `localModels`). */
export function modelSources(providers: ModelProvider[], settings: AppSettings, localModels = cachedLocalModels()): ModelProvider[] {
  const builtIn = [isIntegrationEnabled(settings, 'appleIntelligence') && APPLE_INTELLIGENCE_PROVIDER, onDeviceChatProvider(localModels)];
  return [...providers, ...builtIn.filter((p): p is ModelProvider => !!p)];
}

/** Every source a saved selection may name: as `modelSources`, plus chat models still on their way to this device. */
export function selectableSources(providers: ModelProvider[], settings: AppSettings, localModels: LocalModel[]): ModelProvider[] {
  const onTheWay = onDeviceChatProvider(localModels, (m) => m.downloading || m.partial);
  return [...modelSources(providers, settings, localModels), ...(onTheWay ? [onTheWay] : [])];
}

/** The model a chat runs on, resolved against every model source: the one it is locked to (`chatModelOf`), else the
 *  chat model setting (a chat not yet answered). */
export function resolveChatModel(
  settings: AppSettings,
  providers: ModelProvider[],
  locked?: ModelRef,
  localModels = cachedLocalModels(),
): ResolvedModel | null {
  const sources = modelSources(providers, settings, localModels);
  if (!locked) return resolveModel(settings.chatModel, sources);
  // The locked model as its provider still lists it: a model removed since is gone, so the chat says so.
  const listed = sources.find((p) => p.provider === locked.provider)?.models?.some((m) => m.id === locked.model);
  return listed ? resolveProviderModel(locked.provider, locked.model, sources) : null;
}

/** The Summary model (Settings › Default Models), falling back to the chat model, resolved against every model source. */
export function resolveSummaryModel(settings: AppSettings, providers: ModelProvider[]): ResolvedModel | null {
  return resolveModel(settings.analyzeModel || settings.chatModel, modelSources(providers, settings));
}

/** Whether calls need an API key (on-device models don't). */
export function requiresApiKey(resolved: ResolvedModel): boolean {
  const type = getProviderType(resolved.provider);
  return type !== 'apple-intelligence' && type !== 'on-device';
}

/** One entry in a model picker (Settings › Default Models): any job, any source. */
export interface ModelChoice {
  /** What the setting stores (model id, or a speech selection key). */
  value: string;
  provider: string;
  modelId: string;
  label: string;
  /** Can run now; otherwise listed under "Needs setup" with `hint`. */
  ready: boolean;
  /** Next step when not ready ("Add OpenAI API key"). */
  hint: string | null;
  /** What it takes, gives and can do, for its picker row's chips; null when only its provider's default describes it. */
  profile?: ModelProfile | null;
  /** A step that makes it usable, run from its picker row (download, allow). */
  setup?: ChoiceSetup;
  /** Capabilities shown as small marks on its picker row (e.g. real-time transcription). */
  marks?: ChoiceMark[];
}

/** A capability mark on a picker row: its icon, and its name on hover. */
export interface ChoiceMark {
  icon: LucideIcon;
  label: string;
}

/** One step that makes a choice usable: download a model, or allow a permission. */
export interface ChoiceSetup {
  kind: 'download' | 'allow';
  /** Running now: a spinner, with `percent` once known. */
  busy: boolean;
  percent: number | null;
  run: () => void;
}

/** The next step for a provider that has no API key yet. */
export const apiKeyHint = (provider: string): string => `Add ${getProviderTitle(provider)} API key`;

/** Whether a model on an active provider can run now (a key where one is needed), with the next step when not. */
export function readinessOf(provider: ModelProvider, model: Model): { ready: boolean; hint: string | null } {
  // The model need not be in the provider's list (a suggested model): the provider and its key decide.
  const resolved = resolveProviderModel(provider.provider, model.id, [provider]);
  const ready = !!resolved && (!requiresApiKey(resolved) || !!resolved.apiKey);
  return { ready, hint: ready ? null : apiKeyHint(provider.provider) };
}

/** Picker layout every model picker shares: usable models by provider, then one "Needs setup" list. */
export function groupChoices(choices: ModelChoice[]): { groups: Array<[string, ModelChoice[]]>; needsSetup: ModelChoice[] } {
  const byProvider = new Map<string, ModelChoice[]>();
  choices.filter((c) => c.ready).forEach((c) => byProvider.set(c.provider, [...(byProvider.get(c.provider) ?? []), c]));
  return { groups: [...byProvider.entries()], needsSetup: choices.filter((c) => !c.ready) };
}
