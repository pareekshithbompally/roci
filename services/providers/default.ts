import type { ProvidersService } from './types'
import type { ModelProvider, ProviderSetting } from '../../types/modelProviders'
import { predefinedProviders, MANAGED_MODELS, MANAGED_DEFAULT_URLS } from '../../consts/providers'
import { getPlatformFetch } from '../platform-fetch'

export class DefaultProvidersService implements ProvidersService {
  async getProviders(): Promise<ModelProvider[]> {
    return predefinedProviders
  }

  /** Hook for subclasses to inject platform-specific headers */
  protected buildExtraHeaders(_provider: ModelProvider, _baseUrl: string): Record<string, string> {
    return {}
  }

  async fetchModelsFromProvider(provider: ModelProvider): Promise<string[]> {
    // Return hardcoded models for providers without a /models endpoint (none currently)
    if (MANAGED_MODELS[provider.provider]) {
      return MANAGED_MODELS[provider.provider]
    }

    // Anthropic: use the REST /v1/models endpoint
    if (provider.provider === 'anthropic') {
      if (!provider.api_key) {
        throw new Error('API key required for Anthropic model listing')
      }
      const baseUrl = (provider.base_url || 'https://api.anthropic.com').replace(/\/$/, '')
      const response = await getPlatformFetch()(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'x-api-key': provider.api_key,
          'anthropic-version': '2023-06-01',
        },
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch Anthropic models: ${response.status} ${response.statusText}`)
      }
      const data = await response.json()
      return (data.data as Array<{ id: string }> || []).map((m) => m.id).filter(Boolean)
    }

    // Gemini: use the REST v1beta/models endpoint (SDK doesn't expose list())
    if (provider.provider === 'gemini') {
      if (!provider.api_key) {
        throw new Error('API key required for Gemini model listing')
      }
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

    // For managed providers like OpenAI, fall back to default base URL
    const baseUrl = provider.base_url || MANAGED_DEFAULT_URLS[provider.provider]

    if (!baseUrl) {
      throw new Error('Provider must have base_url configured')
    }

    try {
      const headers: Record<string, string> = {}

      if (provider.api_key) {
        headers['Authorization'] = `Bearer ${provider.api_key}`
      }

      // Merge platform-specific headers from subclass
      Object.assign(headers, this.buildExtraHeaders(provider, baseUrl))

      const response = await getPlatformFetch()(`${baseUrl}/models`, {
        method: 'GET',
        headers,
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

      if (data.data && Array.isArray(data.data)) {
        return data.data
          .map((model: { id: string }) => model.id)
          .filter(Boolean)
      } else if (Array.isArray(data)) {
        return data
          .filter(Boolean)
          .map((model) =>
            typeof model === 'object' && 'id' in model ? model.id : model
          )
      } else if (data.models && Array.isArray(data.models)) {
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
        throw new Error(error.message)
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
