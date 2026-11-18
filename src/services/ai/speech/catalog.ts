/** Cloud voice models for Read aloud: the spine's text→audio models on providers whose AI SDK speaks, keyed as the engine setting stores them. */

import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { jobRecords } from '@services/ai/models';
import type { ModelProvider } from '@shared/types/modelProviders';

/** A cloud voice model the Read aloud engine can be: its provider and model. */
export interface CloudVoiceModel {
  provider: string;
  model: string;
}

export interface CloudVoiceOption extends CloudVoiceModel {
  label: string;
  ready: boolean;
  hint: string | null;
}

/** Engine keys for cloud models hold both parts; the system's and downloaded voices' keys never contain the separator. */
const SEPARATOR = '::';

export const cloudEngineKey = ({ provider, model }: CloudVoiceModel): string => `${provider}${SEPARATOR}${model}`;

/** The cloud voice model a Read aloud engine names, or null for the system's and downloaded voices. */
export function cloudEngineOf(engine: string): CloudVoiceModel | null {
  const at = engine.indexOf(SEPARATOR);
  return at < 0 ? null : { provider: engine.slice(0, at), model: engine.slice(at + SEPARATOR.length) };
}

/** Every cloud voice model: the added ones that output audio, then the suggested ones, on providers that speak. */
export function cloudVoiceOptions(providers: ModelProvider[]): CloudVoiceOption[] {
  return jobRecords(providers, 'speak')
    .filter((r) => r.provider in READ_ALOUD_CONFIG.cloud)
    .map((r) => ({ provider: r.provider, model: r.id, label: r.label, ready: r.ready, hint: r.hint }));
}

/** The voices a cloud model's provider offers, its default first. */
export const cloudVoices = (provider: string): readonly string[] => READ_ALOUD_CONFIG.cloud[provider]?.voices ?? [];
