import type { ModelProvider } from '@shared/types/modelProviders'

/** Model lists for providers without /models discovery; Anthropic and Gemini are discovered live, never listed. */
export const MANAGED_MODELS: Record<string, string[]> = {}

/** Providers that use a native SDK (no user-configurable base URL) */
export const MANAGED_SDK_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'mistral', 'groq']);

/** Providers whose AI SDK exposes a native web search tool (see `getWebSearchTools`). */
export const WEB_SEARCH_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'groq']);

/** Default base URLs for model listing (not chat — adapters have their own defaults) */
export const MANAGED_DEFAULT_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
};

/** Display order everywhere: OpenAI, Anthropic, Gemini first; the rest follow. */
export const predefinedProviders: ModelProvider[] = [
  {
    active: true,
    api_key: '',
    base_url: '',
    explore_models_url: 'https://developers.openai.com/api/docs/models',
    provider: 'openai',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The OpenAI API uses API keys for authentication. Visit your [API Keys](https://platform.openai.com/account/api-keys) page to retrieve the API key you'll use in your requests.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
    ],
    models: [],
  },
  {
    active: true,
    api_key: '',
    base_url: '',
    provider: 'anthropic',
    explore_models_url:
      'https://platform.claude.com/docs/en/models/overview',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The Anthropic API uses API keys for authentication. Visit your [API Keys](https://console.anthropic.com/settings/keys) page to retrieve the API key you'll use in your requests.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
    ],
    models: [],
    custom_header: [
      {
        header: 'anthropic-version',
        value: '2023-06-01',
      },
    ],
  },
  {
    active: true,
    api_key: '',
    base_url: '',
    explore_models_url: 'https://aistudio.google.com/docs/models',
    provider: 'gemini',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The Google API uses API keys for authentication. Visit your [API Keys](https://aistudio.google.com/apikey) page to retrieve the API key you'll use in your requests.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
    ],
    models: [],
  },
  {
    active: true,
    api_key: '',
    base_url: 'https://openrouter.ai/api/v1',
    explore_models_url: 'https://openrouter.ai/models',
    provider: 'openrouter',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The OpenRouter API uses API keys for authentication. Visit your [API Keys](https://openrouter.ai/settings/keys) page to retrieve the API key you'll use in your requests.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
      {
        key: 'base-url',
        title: 'Base URL',
        description:
          'The base endpoint to use. See the [OpenRouter API documentation](https://openrouter.ai/docs/api-reference/overview) for more information.',
        controller_type: 'input',
        controller_props: {
          placeholder: 'https://openrouter.ai/api/v1',
          value: 'https://openrouter.ai/api/v1',
        },
      },
    ],
    models: [],
  },
  {
    active: true,
    api_key: '',
    base_url: '',
    explore_models_url:
      'https://docs.mistral.ai/models',
    provider: 'mistral',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The Mistral API uses API keys for authentication. Visit your [API Keys](https://console.mistral.ai/api-keys/) page to retrieve the API key you'll use in your requests.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
    ],
    models: [],
  },
  {
    active: true,
    api_key: '',
    base_url: '',
    explore_models_url: 'https://console.groq.com/docs/models',
    provider: 'groq',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The Groq API uses API keys for authentication. Visit your [API Keys](https://console.groq.com/keys) page to retrieve the API key you'll use in your requests.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
    ],
    models: [],
  },
  {
    active: true,
    api_key: '',
    base_url: '',
    explore_models_url: 'https://developers.deepgram.com/docs/models-languages-overview',
    provider: 'deepgram',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "Deepgram API keys for transcription. Visit your [Deepgram Console](https://console.deepgram.com/) to retrieve your API key.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
    ],
    models: [],
  },
  {
    active: true,
    api_key: '',
    base_url: '',
    explore_models_url: 'https://elevenlabs.io/docs/speech-to-text/overview',
    provider: 'elevenlabs',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "ElevenLabs API key. Visit your [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys) to retrieve your API key.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
    ],
    models: [],
  }
]

/** Built-in on-device Apple Intelligence provider; a chat and summary model while its integration is on. */
export const APPLE_INTELLIGENCE = {
  provider: 'apple-intelligence',
  model: 'apple-intelligence',
  name: 'Apple Intelligence',
} as const;
