/** Cloud voice models for Read aloud: the spine's text→audio models on providers whose AI SDK speaks; the engine setting stores their `modelKey`. */

import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { jobRecords } from '@services/ai/models';
import type { ModelRef } from '@services/ai/models';
import type { ModelProvider } from '@shared/types/modelProviders';

export interface CloudVoiceOption extends ModelRef {
  label: string;
  ready: boolean;
  hint: string | null;
}

/** Every cloud voice model: the added ones that output audio, then the suggested ones, on providers that speak. */
export function cloudVoiceOptions(providers: ModelProvider[]): CloudVoiceOption[] {
  return jobRecords(providers, 'speak')
    .filter((r) => r.provider in READ_ALOUD_CONFIG.cloud)
    .map((r) => ({ provider: r.provider, model: r.id, label: r.label, ready: r.ready, hint: r.hint }));
}

/** The voices a cloud model's provider offers, its default first. */
export const cloudVoices = (provider: string): readonly string[] => READ_ALOUD_CONFIG.cloud[provider]?.voices ?? [];
