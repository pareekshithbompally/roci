/**
 * Model Avatars Configuration
 *
 * Per-model org icons for local models, loaded from Hugging Face's public
 * avatar endpoint (same approach as the llama.cpp WebUI). Off by default:
 * nothing is requested from huggingface.co until the user enables it.
 */

export const MODEL_AVATARS_CONFIG = {
  /** `${avatarsUrl}/${org}` redirects to the org's avatar image. */
  avatarsUrl: 'https://huggingface.co/api/avatars',
  /** Host prefixes Ollama/LM Studio put in front of HF repo ids (`hf.co/unsloth/...`). */
  hostPrefixes: ['hf.co/', 'huggingface.co/'],
  /** After a failed load, show the monogram and don't retry that org for this long. */
  failureCooldownMs: 60_000,
  /** Orgs whose avatar is black-on-transparent; inverted in dark mode. */
  darkLogoOrgs: ['openai'],
  /** Monogram background: hue from the org name, fixed saturation/lightness. */
  monogramSaturation: 45,
  monogramLightness: 45,
} as const;
