import type { Model } from '@shared/types/modelProviders'

export function getProviderLogo(provider: string) {
  switch (provider) {
    case 'jan':
      return '/images/model-provider/jan.png'
    case 'llamacpp':
      return '/images/model-provider/llamacpp.svg'
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
    case 'local-server':
      return '/images/model-provider/local-server.png'
    default:
      return undefined
  }
}

export const getProviderTitle = (provider: string | undefined | null) => {
  if (!provider) return 'Unknown'

  switch (provider.toLowerCase()) {
    case 'jan':
      return 'Jan'
    case 'llamacpp':
      return 'Llama.cpp'
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
    case 'local-server':
      return 'Local Server'
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1)
  }
}

export function getModelDisplayName(model: Model): string {
  return model.displayName || model.id
}
