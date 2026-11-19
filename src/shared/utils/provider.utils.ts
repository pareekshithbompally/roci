import { LOCAL_PROVIDER_PREFIX, LOCAL_SERVERS, LOCAL_GENERIC_LOGO, SERVER_APPS } from '@config/localServers.config'
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

/** The Mac app behind a local server, when its entry names one (its icon is drawn by macOS). */
export function getProviderApp(provider: string): string | undefined {
  return serverAppOf(provider)?.bundleId
}

export function getProviderLogo(provider: string) {
  if (isLocalProviderId(provider)) return serverAppOf(provider)?.logo ?? LOCAL_GENERIC_LOGO
  switch (provider) {
    case 'hex':
      return '/images/model-provider/hex.png'
    case 'apple':
      return '/images/model-provider/apple.svg'
    case 'anthropic':
      return '/images/model-provider/anthropic.svg'
    case 'mistral':
      return '/images/model-provider/mistral.svg'
    case 'openrouter':
      return '/images/model-provider/open-router.svg'
    case 'groq':
      return '/images/model-provider/groq.svg'
    case 'gemini':
      return '/images/model-provider/gemini.svg'
    case 'apple-intelligence':
      return '/images/apple-intelligence-sm.png'
    case 'openai':
      return '/images/model-provider/openai.svg'
    case 'deepgram':
      return '/images/model-provider/deepgram.png'
    case 'elevenlabs':
      return '/images/model-provider/elevan-labs.png'
    default:
      return undefined
  }
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
