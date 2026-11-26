/** On-device chat models' tuning, in llama-server's option names: the user's values over the maker's and Roci's (the
 *  preset the Mac's server loads each model with), the simple presets, the choices offered, and where a default comes from. */

import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import {
  PERSONALIZATION_CONFIG,
  TUNING_KEYS,
  type KvType,
  type ModelTuning,
  type TuningOption,
  type TuningPreset,
} from '@config/personalization.config';
import { savedPersonalization } from '@shared/utils/personalization';

const { engine, presets, context } = PERSONALIZATION_CONFIG.modelTuning;
const { makerDefaults, rociDefaults } = LOCAL_MODELS_CONFIG;

type TuningKey = keyof ModelTuning;

/** `saved`'s known, set keys only (a setting saved in another shape is ignored). */
export function ownTuning(saved: object): ModelTuning {
  const known: readonly string[] = TUNING_KEYS;
  return Object.fromEntries(Object.entries(saved).filter(([key, value]) => known.includes(key) && value !== undefined)) as ModelTuning;
}

/** The model maker's settings (its model card), or none. */
function makerTuning(modelId: string): ModelTuning {
  return makerDefaults[modelId] ?? {};
}

/** What the user changed for `modelId`, as last loaded (the settings query owns it). */
function savedTuning(modelId: string): ModelTuning {
  return savedPersonalization().modelTuning?.[modelId] ?? {};
}

/** The settings `modelId` runs with: the user's over the maker's over Roci's; unset keys are llama.cpp's own. */
export function resolveTuning(modelId: string, saved: ModelTuning = savedTuning(modelId)): ModelTuning {
  return { ...rociDefaults, ...makerTuning(modelId), ...ownTuning(saved) };
}

/** Every downloaded chat model's resolved settings, by id: what the Mac's server writes into each model's preset. */
export function serverPresets(modelIds: readonly string[], all: Record<string, ModelTuning>): Record<string, ModelTuning> {
  return Object.fromEntries(modelIds.map((id) => [id, resolveTuning(id, all[id] ?? {})]));
}

/** A sampling option's value as the model runs it: resolved, else llama.cpp's. */
export function optionValue(tuning: ModelTuning, key: TuningOption): number {
  return tuning[key] ?? engine[key];
}

/** The keys a preset's choices set: choosing one clears them all first. */
export function presetKeys(preset: TuningPreset): TuningKey[] {
  return [...new Set(presets[preset].options.flatMap((option) => Object.keys(option.tuning) as TuningKey[]))];
}

/** The preset choice the settings match, or none (Custom): a choice with values when the model runs exactly those, an
 *  empty one (the maker's) while the user has set none of the preset's keys. */
export function presetChoice(preset: TuningPreset, saved: ModelTuning, resolved: ModelTuning): string | undefined {
  const keys = presetKeys(preset);
  const own = ownTuning(saved);
  return presets[preset].options.find((option) => {
    const set: ModelTuning = option.tuning;
    if (Object.keys(set).length === 0) return keys.every((key) => own[key] === undefined);
    return keys.every((key) => resolved[key] === set[key]);
  })?.value;
}

/** `saved` without `keys` (back to their defaults). */
export function withoutKeys(saved: ModelTuning, keys: readonly TuningKey[]): ModelTuning {
  const cleared: readonly string[] = keys;
  return Object.fromEntries(Object.entries(ownTuning(saved)).filter(([key]) => !cleared.includes(key))) as ModelTuning;
}

/** `saved` with `preset` set to `choice`: its keys cleared, then the choice's values. */
export function withPreset(preset: TuningPreset, choice: string, saved: ModelTuning): ModelTuning {
  const option = presets[preset].options.find((o) => o.value === choice);
  if (!option) return saved;
  return { ...withoutKeys(saved, presetKeys(preset)), ...option.tuning };
}

/** The KV cache's two halves, set together. */
export const KV_KEYS = ['cache-type-k', 'cache-type-v'] as const satisfies readonly TuningKey[];

/** `saved` with the KV cache's type; llama.cpp's own (f16) clears it. */
export function withKvType(saved: ModelTuning, type: KvType): ModelTuning {
  const rest = withoutKeys(saved, KV_KEYS);
  return type === 'f16' ? rest : { ...rest, 'cache-type-k': type, 'cache-type-v': type };
}

/** The context sizes offered, tokens: powers of two from the least Roci's chat needs up to the model's own maximum (the
 *  least alone when the model states none). */
export function contextChoices(maxTokens: number | null): number[] {
  const choices: number[] = [context.minTokens];
  while (maxTokens && choices[choices.length - 1] * 2 <= maxTokens) choices.push(choices[choices.length - 1] * 2);
  return choices;
}
