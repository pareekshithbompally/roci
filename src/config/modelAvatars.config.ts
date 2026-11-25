/** Hugging Face org avatars for local models; off by default, so nothing is requested until enabled. */

export const MODEL_AVATARS_CONFIG = {
  /** `${avatarsUrl}/${org}` redirects to the org's avatar image. */
  avatarsUrl: 'https://huggingface.co/api/avatars',
  /** Host prefixes Ollama/LM Studio put in front of HF repo ids (`hf.co/unsloth/...`). */
  hostPrefixes: ['hf.co/', 'huggingface.co/'],
} as const;
