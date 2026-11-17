/** Hugging Face org parsing and avatar URLs for models. */

import { MODEL_AVATARS_CONFIG } from '@config/modelAvatars.config';
import { isLocalProviderId } from '@shared/utils/provider.utils';
import { cachedLocalModels } from '@shared/utils/modelResolver';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';

/** A model id's Hugging Face org (`hf.co/unsloth/Qwen3-8B-GGUF:Q4_K_M` → `unsloth`); null when it has none. */
export function modelOrg(modelId: string): string | null {
  const prefix = MODEL_AVATARS_CONFIG.hostPrefixes.find((p) => modelId.startsWith(p));
  const repo = prefix ? modelId.slice(prefix.length) : modelId;
  const parts = repo.split('/');
  if (parts.length < 2) return null;
  const org = parts[0].replace(/^~/, '');
  return org || null;
}

export function getAvatarUrl(org: string): string {
  return `${MODEL_AVATARS_CONFIG.avatarsUrl}/${encodeURIComponent(org.replace(/^~/, ''))}`;
}

/** Stable hue (0–359) for an org's monogram. */
export function orgHue(org: string): number {
  let hash = 0;
  for (const ch of org) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

/** Org avatar for a local model (maker on this device, repo org on a local server) while model icons are on; else null. */
export function modelAvatarOrg(provider: string, modelId: string | undefined, enabled: boolean): string | null {
  if (!enabled || !modelId) return null;
  if (provider === LOCAL_MODELS_CONFIG.provider.id) return cachedLocalModels().find((m) => m.id === modelId)?.maker ?? null;
  return isLocalProviderId(provider) ? modelOrg(modelId) : null;
}
