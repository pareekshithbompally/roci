import type { ModelProvider } from '../types/modelProviders'

/**
 * Hardcoded model lists for providers that have no /models discovery endpoint.
 * NOTE: anthropic and gemini are intentionally NOT here — they both support
 * live model discovery (Anthropic SDK client.models.list(), Gemini REST v1beta/models)
 * and should never be hardcoded so they stay up-to-date automatically.
 */
export const MANAGED_MODELS: Record<string, string[]> = {}

/** Providers that use a native SDK (no user-configurable base URL) */
export const MANAGED_SDK_PROVIDERS = new Set(['openai', 'anthropic', 'gemini']);

/** SDK description shown in settings UI */
export const MANAGED_SDK_INFO: Record<string, string> = {
  openai: 'Uses the OpenAI SDK with the Responses API. No endpoint configuration needed.',
  anthropic: 'Uses the Anthropic SDK directly. No endpoint configuration needed.',
  gemini: 'Uses the Google GenAI SDK natively. No endpoint configuration needed.',
};

/** Default base URLs for model listing (not chat — adapters have their own defaults) */
export const MANAGED_DEFAULT_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
};

export const predefinedProviders: ModelProvider[] = [
  {
    active: true,
    api_key: '',
    base_url: '',
    explore_models_url: 'https://platform.openai.com/docs/models',
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
    base_url: 'https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1',
    explore_models_url: 'https://oai.azure.com/deployments',
    provider: 'azure',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          'The Azure OpenAI API uses API keys for authentication. Visit your [Azure OpenAI Studio](https://oai.azure.com/) to retrieve the API key from your resource.',
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
          'Your Azure OpenAI resource endpoint. See the [Azure OpenAI documentation](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/latest) for more information.',
        controller_type: 'input',
        controller_props: {
          placeholder: 'https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1',
          value: 'https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1',
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
      'https://docs.anthropic.com/en/docs/about-claude/models',
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
      {
        header: 'anthropic-dangerous-direct-browser-access',
        value: 'true',
      },
    ],
  },
  {
    active: true,
    api_key: '',
    base_url: 'https://api.cohere.ai/v1',
    explore_models_url: 'https://docs.cohere.com/v2/docs/models',
    provider: 'cohere',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The Cohere API uses API keys for authentication. Visit your [API Keys](https://dashboard.cohere.com/api-keys) page to retrieve the API key you'll use in your requests.",
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
          'The base OpenAI-compatible endpoint to use. See the [Cohere documentation](https://docs.cohere.com/docs/compatibility-api) for more information.',
        controller_type: 'input',
        controller_props: {
          placeholder: 'https://api.cohere.ai/compatibility/v1',
          value: 'https://api.cohere.ai/compatibility/v1',
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
    base_url: 'https://api.mistral.ai/v1',
    explore_models_url:
      'https://docs.mistral.ai/getting-started/models/models_overview/',
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
      {
        key: 'base-url',
        title: 'Base URL',
        description:
          'The base endpoint to use. See the [Mistral documentation](https://docs.mistral.ai/getting-started/models/models_overview/) for more information.',
        controller_type: 'input',
        controller_props: {
          placeholder: 'https://api.mistral.ai/v1',
          value: 'https://api.mistral.ai/v1',
        },
      },
    ],
    models: [],
  },
  {
    active: true,
    api_key: '',
    base_url: 'https://api.groq.com/openai/v1',
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
      {
        key: 'base-url',
        title: 'Base URL',
        description:
          'The base OpenAI-compatible endpoint to use. See the [Groq documentation](https://console.groq.com/docs) for more information.',
        controller_type: 'input',
        controller_props: {
          placeholder: 'https://api.groq.com/openai/v1',
          value: 'https://api.groq.com/openai/v1',
        },
      },
    ],
    models: [],
  },
  {
    active: true,
    api_key: '',
    base_url: '',
    explore_models_url: 'https://ai.google.dev/gemini-api/docs/models/gemini',
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
    base_url: 'https://router.huggingface.co/v1',
    explore_models_url:
      'https://huggingface.co/models?pipeline_tag=text-generation&inference_provider=all',
    provider: 'huggingface',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The Hugging Face API uses tokens for authentication. Visit your [Access Tokens](https://huggingface.co/settings/tokens) page to retrieve the token you'll use in your requests.",
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Token',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
      {
        key: 'base-url',
        title: 'Base URL',
        description:
          'The base endpoint to use. See the [Hugging Face Inference Providers documentation](https://huggingface.co/docs/inference-providers) for more information.',
        controller_type: 'input',
        controller_props: {
          placeholder: 'https://router.huggingface.co/v1',
          value: 'https://router.huggingface.co/v1',
        },
      },
    ],
    models: [],
  },
  {
    active: false,
    api_key: '',
    base_url: 'https://api.x.ai/v1',
    explore_models_url: 'https://docs.x.ai/docs/models',
    provider: 'xai',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          "The xAI API uses API keys for authentication. Visit your [API Keys](https://console.x.ai/settings/api-keys) page to retrieve the API key you'll use in your requests.",
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
          'The base endpoint to use. See the [xAI documentation](https://docs.x.ai/docs) for more information.',
        controller_type: 'input',
        controller_props: {
          placeholder: 'https://api.x.ai/v1',
          value: 'https://api.x.ai/v1',
        },
      },
    ],
    models: [],
  },
  {
    active: false,
    api_key: '',
    base_url: '',
    provider: 'llamacpp',
    settings: [
      {
        key: 'ctx-size',
        title: 'Context Size',
        description: 'Maximum context window for the model. Higher values use more memory.',
        controller_type: 'input',
        controller_props: {
          placeholder: '4096',
          value: 4096,
          type: 'number',
        },
      },
      {
        key: 'n-gpu-layers',
        title: 'GPU Layers',
        description: 'Number of layers to offload to GPU. Use -1 to offload all layers (recommended for Apple Silicon).',
        controller_type: 'input',
        controller_props: {
          placeholder: '-1',
          value: -1,
          type: 'number',
        },
      },
      {
        key: 'threads',
        title: 'CPU Threads',
        description: 'Number of CPU threads to use for inference.',
        controller_type: 'input',
        controller_props: {
          placeholder: '4',
          value: 4,
          type: 'number',
        },
      },
    ],
    models: [],
  },
  {
    active: false,
    api_key: '',
    base_url: 'http://localhost:1234/v1',
    explore_models_url: '',
    provider: 'local-server',
    settings: [
      {
        key: 'api-key',
        title: 'API Key',
        description:
          'Optional API key for your local server if required.',
        controller_type: 'input',
        controller_props: {
          placeholder: 'Insert API Key (optional)',
          value: '',
          type: 'password',
          input_actions: ['unobscure', 'copy'],
        },
      },
      {
        key: 'base-url',
        title: 'Base URL',
        description:
          'The base endpoint of your local OpenAI-compatible server (e.g., LM Studio, Ollama, Jan).',
        controller_type: 'input',
        controller_props: {
          placeholder: 'http://localhost:1234/v1',
          value: 'http://localhost:1234/v1',
        },
      },
    ],
    models: [],
  },
]
