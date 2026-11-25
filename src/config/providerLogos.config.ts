/** Every logo Roci shows, as one full square tile in its brand's own colours (`public/images/logos/`, made by
 *  `npm run logos` from `docs/design/logo-tiles/`). Keyed by brand: a cloud provider's id, a server app's id, or a model maker's
 *  brand. Apple's are never shown: Apple Intelligence and anything unknown get the generic AI tile. */

const tile = (name: string) => `/images/logos/${name}.svg`;
/** Roci's own tiles, rendered from Icon Composer documents. */
const rendered = (name: string) => `/images/logos/${name}.webp`;

export const AI_LOGO = rendered('ai');

/** This device, by form factor. */
export const DEVICE_LOGOS = { desktop: rendered('device-mac'), tablet: rendered('device-ipad'), phone: rendered('device-iphone') } as const;

export const LOGOS: Readonly<Record<string, string>> = {
  // Cloud providers
  openai: tile('openai'),
  anthropic: tile('anthropic'),
  gemini: tile('gemini'),
  openrouter: tile('openrouter'),
  mistral: tile('mistral'),
  groq: tile('groq'),
  elevenlabs: tile('elevenlabs'),
  deepgram: tile('deepgram'),
  hex: tile('hex'),
  // Server apps
  llama: tile('llamacpp'),
  llamacpp: tile('llamacpp'),
  ollama: tile('ollama'),
  lmstudio: tile('lmstudio'),
  vllm: tile('vllm'),
  jan: tile('jan'),
  sglang: tile('sglang'),
  koboldcpp: tile('server'),
  server: tile('server'),
  // Model makers (by `MAKER_BRANDS`)
  gemma: tile('gemma'),
  nvidia: tile('nvidia'),
  liquid: tile('liquid'),
  qwen: tile('qwen'),
  meta: tile('meta'),
  deepseek: tile('deepseek'),
  huggingface: tile('huggingface'),
};

/** A model maker's Hugging Face org (lower case) → its brand in `LOGOS`. An org not here shows its own Hugging Face picture. */
export const MAKER_BRANDS: Readonly<Record<string, string>> = {
  google: 'gemma',
  nvidia: 'nvidia',
  liquidai: 'liquid',
  qwen: 'qwen',
  'meta-llama': 'meta',
  'deepseek-ai': 'deepseek',
  mistralai: 'mistral',
  openai: 'openai',
  huggingface: 'huggingface',
};
