/** How Roci reads a provider's model list: the list formats it knows, which providers use which, and where each lives. */

/** A model-list format; each is read by one lister shared by every provider that speaks it. */
export type ModelListStyle = 'openai' | 'gemini' | 'ollama' | 'lmstudio' | 'llama-server';

export const MODEL_LISTS_CONFIG = {
  /** Providers whose list isn't OpenAI-style; any other provider, and any server not recognised below, lists OpenAI-style. */
  styleByProvider: {
    gemini: 'gemini',
    'local:ollama': 'ollama',
    'local:lmstudio': 'lmstudio',
  } as Readonly<Record<string, ModelListStyle>>,

  /** Formats a server Roci doesn't know by name is checked for (all at once; the first here that answers wins). */
  detectable: ['ollama', 'lmstudio', 'llama-server'] as const satisfies readonly ModelListStyle[],

  /** Paths from the server root, or (OpenAI-style, Gemini) from the API base URL. */
  paths: {
    openAIModels: '/models',
    ollamaTags: '/api/tags',
    ollamaVersion: '/api/version',
    lmStudioModels: '/api/v0/models',
  },

  /** Gemini's list returns 50 per page unless asked; this asks for its maximum, so the whole list arrives at once. */
  geminiPageSize: 1000,
} as const;
