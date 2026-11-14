/**
 * Model Resolver Utility
 * 
 * Resolves a model ID to its provider and configuration.
 * Used to route API calls to the correct provider service.
 */

import type { ModelProvider, Model } from '@shared/types/modelProviders';
import type { ProviderType } from '@services/ai/types';
import { MANAGED_SDK_PROVIDERS, MANAGED_SDK_INFO, MANAGED_DEFAULT_URLS, APPLE_INTELLIGENCE } from '@config/providers.config';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import type { AppSettings } from '@shared/types';
import { getProviderTitle } from '@shared/utils/provider.utils';

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

/**
 * Resolve a model ID to its full configuration
 * @param modelId The model ID (e.g., "gpt-4o", "claude-3-5-sonnet")
 * @param providers List of configured providers from settings
 * @returns ResolvedModel or null if not found
 */
export function resolveModel(
  modelId: string,
  providers: ModelProvider[]
): ResolvedModel | null {
  if (!modelId) return null;

  for (const provider of providers) {
    // Skip inactive providers
    if (!provider.active) continue;

    // Find the model in this provider's model list
    const model = provider.models?.find(m => m.id === modelId);
    if (model) {
      return { modelId, provider: provider.provider, ...providerCredentials(provider), model, providerConfig: provider };
    }
  }

  return null;
}

/**
 * Resolve a model on one named provider — for selections stored as
 * provider + model (speech), where the model need not be in the provider's list.
 */
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

/**
 * Get the provider type for adapter routing.
 * 6-way: gemini | anthropic | openai | mistral | groq | openai-compat
 */
export function getProviderType(provider: string): ProviderType {
  if (provider === APPLE_INTELLIGENCE.provider) return 'apple-intelligence';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'openai') return 'openai';
  if (provider === 'mistral') return 'mistral';
  if (provider === 'groq') return 'groq';
  return 'openai-compat';
}

/**
 * Get all available models from active providers
 */
export function getAllActiveModels(providers: ModelProvider[]): Array<{
  id: string;
  name: string;
  provider: string;
  providerName: string;
}> {
  const models: Array<{
    id: string;
    name: string;
    provider: string;
    providerName: string;
  }> = [];

  for (const provider of providers) {
    if (!provider.active) continue;
    
    for (const model of provider.models || []) {
      models.push({
        id: model.id,
        name: model.name || model.displayName || model.id,
        provider: provider.provider,
        providerName: getProviderTitle(provider.provider),
      });
    }
  }

  return models;
}

/** Whether a provider uses a native SDK (no user-configurable base URL) */
export function isManagedSDK(provider: string): boolean {
  return MANAGED_SDK_PROVIDERS.has(provider);
}

/** SDK description shown in settings UI for managed providers */
export function getManagedSDKInfo(provider: string): string | null {
  return MANAGED_SDK_INFO[provider] ?? null;
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

/**
 * Summary-model sources: the user's providers plus the models integrations
 * contribute while switched on (Apple Intelligence). Summaries only — chat and
 * knowledge-graph extraction use the user's providers (Apple's on-device model
 * has no tool calling and a 4k context).
 */
export function withSummaryModels(providers: ModelProvider[], settings: AppSettings): ModelProvider[] {
  return isIntegrationEnabled(settings, 'appleIntelligence') ? [...providers, APPLE_INTELLIGENCE_PROVIDER] : providers;
}

/** The chat model (also knowledge-graph extraction), resolved against the user's providers. */
export function resolveChatModel(settings: AppSettings, providers: ModelProvider[]): ResolvedModel | null {
  return resolveModel(settings.chatModel, providers);
}

/** The Summary model (Settings › Capabilities), falling back to the chat model, resolved against every summary source. */
export function resolveSummaryModel(settings: AppSettings, providers: ModelProvider[]): ResolvedModel | null {
  return resolveModel(settings.analyzeModel || settings.chatModel, withSummaryModels(providers, settings));
}

/** Whether calls need an API key (on-device models don't). */
export function requiresApiKey(resolved: ResolvedModel): boolean {
  return getProviderType(resolved.provider) !== 'apple-intelligence';
}

/** One entry in a model picker (Settings › Capabilities): any job, any source. */
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
}

/** Every model the given sources offer, with whether it can run (a key where one is needed). */
export function modelChoices(sources: ModelProvider[]): ModelChoice[] {
  return sources
    .filter((p) => p.active)
    .flatMap((p) => (p.models ?? []).map((m) => {
      const resolved = resolveModel(m.id, [p]);
      const ready = !!resolved && (!requiresApiKey(resolved) || !!resolved.apiKey);
      return {
        value: m.id,
        provider: p.provider,
        modelId: m.id,
        label: m.name || m.id,
        ready,
        hint: ready ? null : `Add ${getProviderTitle(p.provider)} API key`,
      };
    }));
}

/** Picker layout every model picker shares: usable models by provider, then one "Needs setup" list. */
export function groupChoices(choices: ModelChoice[]): { groups: Array<[string, ModelChoice[]]>; needsSetup: ModelChoice[] } {
  const byProvider = new Map<string, ModelChoice[]>();
  choices.filter((c) => c.ready).forEach((c) => byProvider.set(c.provider, [...(byProvider.get(c.provider) ?? []), c]));
  return { groups: [...byProvider.entries()], needsSetup: choices.filter((c) => !c.ready) };
}
