/**
 * Model Resolver Utility
 * 
 * Resolves a model ID to its provider and configuration.
 * Used to route API calls to the correct provider service.
 */

import type { ModelProvider, Model } from '@shared/types/modelProviders';
import type { ProviderType } from '@services/ai/types';
import { MANAGED_SDK_PROVIDERS, MANAGED_SDK_INFO, MANAGED_DEFAULT_URLS } from '@config/providers.config';
import { getProviderTitle } from '@shared/utils/provider.utils';

export interface ResolvedModel {
  modelId: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: Model;
  providerConfig: ModelProvider;
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
      // Get API key and base URL from provider settings
      const apiKeySetting = provider.settings.find(s => s.key === 'api-key');
      const baseUrlSetting = provider.settings.find(s => s.key === 'base-url');

      const apiKey = (apiKeySetting?.controller_props.value as string) || provider.api_key || '';
      const baseUrl = (baseUrlSetting?.controller_props.value as string) || provider.base_url || '';

      return {
        modelId,
        provider: provider.provider,
        apiKey,
        baseUrl,
        model,
        providerConfig: provider,
      };
    }
  }

  return null;
}

/**
 * Get the provider type for adapter routing.
 * 6-way: gemini | anthropic | openai | mistral | groq | openai-compat
 */
export function getProviderType(provider: string): ProviderType {
  if (provider === 'gemini') return 'gemini';
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'openai') return 'openai';
  if (provider === 'mistral') return 'mistral';
  if (provider === 'groq') return 'groq';
  return 'openai-compat';
}

/**
 * Check if a resolved model has tool calling enabled.
 * Defaults to true for managed SDK providers, false otherwise.
 */
export function supportsTools(resolved: ResolvedModel): boolean {
  if (resolved.model.toolsEnabled !== undefined) {
    return resolved.model.toolsEnabled;
  }
  // Default: true for remote managed providers, false for local/unknown
  return MANAGED_SDK_PROVIDERS.has(resolved.provider);
}

/**
 * Check if a provider supports web search tool calling
 */
export function supportsWebSearch(provider: string): boolean {
  return provider === 'gemini' || provider === 'openai' || provider === 'anthropic' || provider === 'groq';
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
