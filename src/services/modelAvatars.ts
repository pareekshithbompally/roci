/**
 * Model avatars — HF org parsing and avatar URL (llama.cpp WebUI pattern).
 */

import { MODEL_AVATARS_CONFIG } from '@config/modelAvatars.config';
import { isLocalProviderId } from '@shared/utils/provider.utils';

/**
 * The Hugging Face org of a model id, or null when the id has none.
 * `qwen/qwen3-8b` → `qwen`; `~org/name` → `org`; `hf.co/unsloth/Qwen3-8B-GGUF:Q4_K_M` → `unsloth`;
 * `llama3.2` (Ollama library model) → null.
 */
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

/**
 * The org whose avatar represents a model, or null to show no org avatar.
 * Only local models get one, and only when the user enabled model icons
 * (that is the only time Kasset requests anything from huggingface.co).
 */
export function modelAvatarOrg(provider: string, modelId: string | undefined, enabled: boolean): string | null {
  if (!enabled || !modelId || !isLocalProviderId(provider)) return null;
  return modelOrg(modelId);
}
