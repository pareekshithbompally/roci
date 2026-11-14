/**
 * Speech credentials — built on the shared `providerCredentials()` reader
 * (via `resolveProviderModel`), with the user-facing reason a provider can't run.
 */

import { providerCredentials, resolveProviderModel } from '@shared/utils/modelResolver';
import { getProviderTitle } from '@shared/utils/provider.utils';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ResolvedModel } from '@shared/utils/modelResolver';

/** Why a keyed speech provider can't run (off, or no API key), or null when it can. */
export function credentialsError(providerId: string, providers: ModelProvider[]): string | null {
  const provider = providers.find((p) => p.active && p.provider === providerId);
  if (!provider) return `Provider "${providerId}" is not configured or is inactive.`;
  if (!providerCredentials(provider).apiKey.trim()) {
    return `Configure ${getProviderTitle(providerId)} API key in Settings → Providers.`;
  }
  return null;
}

/** The provider + model to call, with its key and base URL; throws the user-facing reason when it can't run. */
export function resolveSpeechModel(providerId: string, modelId: string, providers: ModelProvider[]): ResolvedModel {
  const error = credentialsError(providerId, providers);
  if (error) throw new Error(error);
  const resolved = resolveProviderModel(providerId, modelId, providers);
  if (!resolved) throw new Error('Choose a transcription model in Settings › Capabilities.');
  return resolved;
}
