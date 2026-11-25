import { LOCAL_PROVIDER_PREFIX, LOCAL_SERVERS, SERVER_APPS } from '@config/localServers.config'
import { AI_LOGO, DEVICE_LOGOS, LOGOS } from '@config/providerLogos.config'
import type { ServerApp } from '@config/localServers.config'
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config'
import type { Model, ModelProvider } from '@shared/types/modelProviders'
import type { LoadedSettings } from '@shared/contexts/SettingsContext'
import { queryClient } from '@shared/query/queryClient'
import { queryKeys } from '@shared/query/queryKeys'

/** Servers the user runs (`local:ollama`, `local:mac-mini.tailnet.ts.net`), on this Mac or another computer. */
export function isLocalProviderId(provider: string): boolean {
  return provider.startsWith(LOCAL_PROVIDER_PREFIX)
}

/** The saved providers as last loaded (the settings query owns them). */
function cachedProviders(): ModelProvider[] {
  return queryClient.getQueryData<LoadedSettings>(queryKeys.storeSettings())?.providers ?? []
}

/** A local server's app: fixed for a known port's server, else the one the user named it as; none for any other provider. */
export function serverAppOf(provider: string): ServerApp | undefined {
  if (!isLocalProviderId(provider)) return undefined
  const id = LOCAL_SERVERS.find((s) => s.id === provider)?.serverApp
    ?? cachedProviders().find((p) => p.provider === provider)?.server_app
  return SERVER_APPS.find((app) => app.id === id)
}

/** A server found on a known app's default port: its app is that one, never picked. */
export function isKnownPortServer(provider: string): boolean {
  return LOCAL_SERVERS.some((s) => s.id === provider)
}

const ON_DEVICE = LOCAL_MODELS_CONFIG.provider

/** A provider's logo tile: its brand's, this device's (by form factor), else the generic AI tile (Apple's included). */
export function logoOf(provider: string, device: keyof typeof DEVICE_LOGOS = 'desktop'): string {
  if (provider === ON_DEVICE.id) return DEVICE_LOGOS[device]
  const brand = isLocalProviderId(provider) ? serverAppOf(provider)?.id ?? 'server' : provider
  return LOGOS[brand] ?? AI_LOGO
}

export const getProviderTitle = (provider: string | undefined | null) => {
  if (!provider) return 'Unknown'
  if (isLocalProviderId(provider)) {
    return serverAppOf(provider)?.label ?? provider.slice(LOCAL_PROVIDER_PREFIX.length)
  }
  if (provider === ON_DEVICE.id) return ON_DEVICE.title

  switch (provider.toLowerCase()) {
    case 'openai':
      return 'OpenAI'
    case 'openrouter':
      return 'OpenRouter'
    case 'gemini':
      return 'Gemini'
    case 'apple-intelligence':
      return 'Apple Intelligence'
    case 'anthropic':
      return 'Anthropic'
    case 'groq':
      return 'Groq'
    case 'mistral':
      return 'Mistral AI'
    case 'deepgram':
      return 'Deepgram'
    case 'elevenlabs':
      return 'ElevenLabs'
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1)
  }
}

/** A model's one display name everywhere: the user's rename, else the provider's name, else its id. */
export function getModelDisplayName(model: Model): string {
  return model.displayName || model.name || model.id
}

/** A provider setting's saved value (`api-key`, `base-url`); empty when unset. */
export function providerSetting(provider: ModelProvider, key: string): string {
  const value = provider.settings.find((s) => s.key === key)?.controller_props.value
  return typeof value === 'string' ? value : ''
}
