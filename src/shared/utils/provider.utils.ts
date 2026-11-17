import { LOCAL_PROVIDER_PREFIX, LOCAL_SERVERS, LOCAL_GENERIC_LOGO } from '@config/localServers.config'
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config'
import type { Model, ModelProvider } from '@shared/types/modelProviders'

/** Local servers (`local:ollama`, `local:127.0.0.1:9000`) run on this Mac. */
export function isLocalProviderId(provider: string): boolean {
  return provider.startsWith(LOCAL_PROVIDER_PREFIX)
}

function localEntry(provider: string) {
  return LOCAL_SERVERS.find((s) => s.id === provider)
}

const ON_DEVICE = LOCAL_MODELS_CONFIG.provider

/** The Mac app behind a local server, when its entry names one (its icon is drawn by macOS). */
export function getProviderApp(provider: string): string | undefined {
  return isLocalProviderId(provider) ? localEntry(provider)?.app : undefined
}

export function getProviderLogo(provider: string) {
  if (isLocalProviderId(provider)) return localEntry(provider)?.logo ?? LOCAL_GENERIC_LOGO
  if (provider === ON_DEVICE.id) return LOCAL_GENERIC_LOGO
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
    return localEntry(provider)?.label ?? provider.slice(LOCAL_PROVIDER_PREFIX.length)
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
