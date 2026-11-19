import type { ProvidersService } from './types'
import type { ModelProvider, ProviderSetting } from '@shared/types/modelProviders'
import { predefinedProviders, MANAGED_MODELS, MANAGED_DEFAULT_URLS } from '@config/providers.config'
import { getPlatformFetch } from '@services/platform-fetch'
import type { ListedModel } from '@services/ai/models/report'
import { listModels, ListRequestError } from './listers'

/** Model-list base URLs for providers that have a known API endpoint. */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
}

/** What a refusal means, by status. */
const REFUSALS: Record<number, (provider: string) => string> = {
  401: (provider) => `Authentication failed: API key is required or invalid for ${provider}`,
  403: (provider) => `Access forbidden: Check your API key permissions for ${provider}`,
  404: (provider) => `Models endpoint not found for ${provider}. Check the base URL configuration.`,
}

/** A listing failure in words the Test row shows: a refusal by status, an unreachable server, or anything else. */
function listingError(provider: string, baseUrl: string, error: unknown): Error {
  if (error instanceof ListRequestError) {
    const refusal = REFUSALS[error.status]
    return new Error(refusal ? refusal(provider) : `Failed to fetch models from ${provider}: ${error.message}`)
  }
  if (error instanceof Error && error.message.includes('fetch')) {
    return new Error(`Cannot connect to ${provider} at ${baseUrl}. Please check that the service is running and accessible.`)
  }
  return new Error(`Unexpected error while fetching models from ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`)
}

export class DefaultProvidersService implements ProvidersService {
  async getProviders(): Promise<ModelProvider[]> {
    return predefinedProviders
  }

  /** Headers with both Authorization and x-api-key for compatibility, plus the provider's custom headers. */
  private buildHeaders(provider: ModelProvider): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (provider.api_key) {
      headers['Authorization'] = `Bearer ${provider.api_key}`
      headers['x-api-key'] = provider.api_key
    }

    // Merge provider-specific custom headers (e.g. anthropic-version)
    if (provider.custom_header) {
      for (const h of provider.custom_header) {
        headers[h.header] = h.value
      }
    }

    return headers
  }

  async fetchModelsFromProvider(provider: ModelProvider): Promise<ListedModel[]> {
    // Return hardcoded models for providers without a /models endpoint (none currently)
    if (MANAGED_MODELS[provider.provider]) {
      return MANAGED_MODELS[provider.provider].map((id) => ({ id, report: {} }))
    }

    if (!provider.api_key) {
      throw new Error(`API key required for ${provider.provider} model listing`)
    }

    const baseUrl = provider.base_url || PROVIDER_BASE_URLS[provider.provider] || MANAGED_DEFAULT_URLS[provider.provider]
    if (!baseUrl) {
      throw new Error(`${provider.provider} requires a base URL to be configured`)
    }

    try {
      return await listModels(provider.provider, { baseUrl, apiKey: provider.api_key, headers: this.buildHeaders(provider) })
    } catch (error: unknown) {
      console.error('[DefaultProvidersService] Fetching models failed:', error)
      throw listingError(provider.provider, baseUrl, error)
    }
  }

  async updateSettings(providerName: string, settings: ProviderSetting[]): Promise<void> {
    console.log('updateSettings called:', { providerName, settings })
  }

  fetch(): typeof fetch {
    return getPlatformFetch()
  }
}
