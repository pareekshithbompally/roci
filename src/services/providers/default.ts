import type { ProvidersService } from './types'
import type { ModelProvider, ProviderSetting } from '@shared/types/modelProviders'
import { predefinedProviders, MANAGED_MODELS, MANAGED_DEFAULT_URLS } from '@config/providers.config'
import { getPlatformFetch } from '@services/platform-fetch'

/** Default base URLs for providers that have a known API endpoint */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
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

  async fetchModelsFromProvider(provider: ModelProvider): Promise<string[]> {
    // Return hardcoded models for providers without a /models endpoint (none currently)
    if (MANAGED_MODELS[provider.provider]) {
      return MANAGED_MODELS[provider.provider]
    }

    if (!provider.api_key) {
      throw new Error(`API key required for ${provider.provider} model listing`)
    }

    // Gemini: uses a different endpoint structure (API key in query param, different response shape)
    if (provider.provider === 'gemini') {
      const resp = await getPlatformFetch()(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.api_key}`
      )
      if (!resp.ok) {
        throw new Error(`Failed to fetch Gemini models: ${resp.status} ${resp.statusText}`)
      }
      const data = await resp.json()
      return (data.models as Array<{ name: string }> || [])
        .map((m) => m.name.replace(/^models\//, ''))
        .filter(Boolean)
    }

    // All other providers: GET {baseUrl}/models with unified headers
    const baseUrl = (
      provider.base_url ||
      PROVIDER_BASE_URLS[provider.provider] ||
      MANAGED_DEFAULT_URLS[provider.provider]
    )?.replace(/\/$/, '')

    if (!baseUrl) {
      throw new Error(`${provider.provider} requires a base URL to be configured`)
    }

    try {
      const response = await getPlatformFetch()(`${baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(provider),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            `Authentication failed: API key is required or invalid for ${provider.provider}`
          )
        } else if (response.status === 403) {
          throw new Error(
            `Access forbidden: Check your API key permissions for ${provider.provider}`
          )
        } else if (response.status === 404) {
          throw new Error(
            `Models endpoint not found for ${provider.provider}. Check the base URL configuration.`
          )
        } else {
          throw new Error(
            `Failed to fetch models from ${provider.provider}: ${response.status} ${response.statusText}`
          )
        }
      }

      const data = await response.json()

      // Handle 3 common response formats
      if (data.data && Array.isArray(data.data)) {
        // OpenAI / Anthropic format: { data: [{ id: "model-id" }, ...] }
        return data.data
          .map((model: { id: string }) => model.id)
          .filter(Boolean)
      } else if (Array.isArray(data)) {
        // Direct array format
        return data
          .filter(Boolean)
          .map((model) =>
            typeof model === 'object' && 'id' in model ? model.id : model
          )
      } else if (data.models && Array.isArray(data.models)) {
        // { models: [...] } format
        return data.models
          .map((model: string | { id: string }) =>
            typeof model === 'string' ? model : model.id
          )
          .filter(Boolean)
      }

      console.warn('Unexpected response format from provider API:', data)
      return []
    } catch (error) {
      console.error('Error fetching models from provider:', error)

      const structuredErrorPrefixes = [
        'Authentication failed',
        'Access forbidden',
        'Models endpoint not found',
        'Failed to fetch models from',
      ]

      if (
        error instanceof Error &&
        structuredErrorPrefixes.some((prefix) =>
          error.message.startsWith(prefix)
        )
      ) {
        throw error
      }

      if (error instanceof Error && error.message.includes('fetch')) {
        throw new Error(
          `Cannot connect to ${provider.provider} at ${baseUrl}. Please check that the service is running and accessible.`
        )
      }

      throw new Error(
        `Unexpected error while fetching models from ${provider.provider}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async updateSettings(providerName: string, settings: ProviderSetting[]): Promise<void> {
    console.log('updateSettings called:', { providerName, settings })
  }

  fetch(): typeof fetch {
    return getPlatformFetch()
  }
}
