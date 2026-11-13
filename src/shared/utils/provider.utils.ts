import { LOCAL_PROVIDER_PREFIX, LOCAL_SERVERS, LOCAL_GENERIC_LOGO } from '@config/localServers.config'
import type { Model } from '@shared/types/modelProviders'

/** Local servers (`local:ollama`, `local:127.0.0.1:9000`) run on this Mac. */
export function isLocalProviderId(provider: string): boolean {
  return provider.startsWith(LOCAL_PROVIDER_PREFIX)
}

function localEntry(provider: string) {
  return LOCAL_SERVERS.find((s) => s.id === provider)
}

export function getProviderLogo(provider: string) {
  if (isLocalProviderId(provider)) return localEntry(provider)?.logo ?? LOCAL_GENERIC_LOGO
  switch (provider) {
    case 'anthropic':
      return '/images/model-provider/anthropic.svg'
    case 'huggingface':
      return '/images/model-provider/huggingface.svg'
    case 'mistral':
      return '/images/model-provider/mistral.svg'
    case 'openrouter':
      return '/images/model-provider/open-router.svg'
    case 'groq':
      return '/images/model-provider/groq.svg'
    case 'cohere':
      return '/images/model-provider/cohere.svg'
    case 'gemini':
      return '/images/model-provider/gemini.svg'
    case 'openai':
      return '/images/model-provider/openai.svg'
    case 'azure':
      return '/images/model-provider/azure.svg'
    case 'xai':
      return '/images/model-provider/xai.svg'
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

  switch (provider.toLowerCase()) {
    case 'openai':
      return 'OpenAI'
    case 'openrouter':
      return 'OpenRouter'
    case 'gemini':
      return 'Gemini'
    case 'huggingface':
      return 'Hugging Face'
    case 'anthropic':
      return 'Anthropic'
    case 'azure':
      return 'Azure OpenAI'
    case 'cohere':
      return 'Cohere'
    case 'groq':
      return 'Groq'
    case 'mistral':
      return 'Mistral AI'
    case 'xai':
      return 'xAI (Grok)'
    case 'deepgram':
      return 'Deepgram'
    case 'elevenlabs':
      return 'ElevenLabs'
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1)
  }
}

export function getModelDisplayName(model: Model): string {
  return model.displayName || model.id
}
