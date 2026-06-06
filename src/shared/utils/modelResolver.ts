/**
 * Model Resolver Utility
 * 
 * Resolves a model ID to its provider and configuration.
 * Used to route API calls to the correct provider service.
 */

import type { ModelProvider, Model } from '@shared/types/modelProviders';
import type { ProviderType } from '@services/ai/types';
import { MANAGED_SDK_PROVIDERS, MANAGED_SDK_INFO, MANAGED_DEFAULT_URLS, TRANSCRIPTION_STRATEGIES } from '@config/providers.config';
import type { TranscriptionStrategy } from '@config/providers.config';

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
 * 7-way: gemini | anthropic | openai | mistral | xai | groq | openai-compat
 */
export function getProviderType(provider: string): ProviderType {
  if (provider === 'gemini') return 'gemini';
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'openai') return 'openai';
  if (provider === 'mistral') return 'mistral';
  if (provider === 'xai') return 'xai';
  if (provider === 'groq') return 'groq';
  return 'openai-compat';
}

/**
 * Check if a provider supports audio input for transcription
 */
export function supportsAudioInput(provider: string): boolean {
  return provider === 'gemini';
}

/**
 * Check if a provider supports chat voice input (mic button).
 * Driven by TRANSCRIPTION_STRATEGIES — add a new entry there, not here.
 */
export function supportsTranscription(provider: string): boolean {
  return TRANSCRIPTION_STRATEGIES[provider] != null;
}

/**
 * Get the transcription strategy for a provider, or null if unsupported.
 */
export function getTranscriptionStrategy(provider: string): TranscriptionStrategy {
  return TRANSCRIPTION_STRATEGIES[provider] ?? null;
}

export type { TranscriptionStrategy };

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
  return provider === 'gemini' || provider === 'openai' || provider === 'anthropic' || provider === 'xai' || provider === 'groq';
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
        providerName: getProviderDisplayName(provider.provider),
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

/**
 * Get human-readable provider name
 */
export function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    'openai': 'OpenAI',
    'azure': 'Azure OpenAI',
    'anthropic': 'Anthropic',
    'cohere': 'Cohere',
    'openrouter': 'OpenRouter',
    'mistral': 'Mistral AI',
    'groq': 'Groq',
    'gemini': 'Google Gemini',
    'huggingface': 'Hugging Face',
    'xai': 'xAI (Grok)',
    'local-server': 'Local Server',
    'llamacpp': 'Llama.cpp',
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}
