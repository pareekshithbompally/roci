/** On-device chat models' tuning: the maker's values, then the user's, as AI SDK call settings; and the simple presets. */

import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { PERSONALIZATION_CONFIG, type ModelTuning, type TuningKnob, type TuningPreset } from '@config/personalization.config';
import { savedPersonalization } from '@shared/utils/personalization';

const { engine, presets } = PERSONALIZATION_CONFIG.modelTuning;

/** The tuning keys the AI SDK names itself; the rest travel as the on-device provider's options (the reply length too:
 *  it applies to free replies only, never cutting a schema reply short). */
type SdkKey = 'temperature' | 'topP' | 'topK' | 'presencePenalty' | 'frequencyPenalty';

/** The on-device provider's own options (`providerOptions['on-device']`). */
export type OnDeviceTuning = Omit<ModelTuning, SdkKey>;

/** `tuning` without its unset keys. */
function setOnly<T extends object>(tuning: T): Partial<T> {
  return Object.fromEntries(Object.entries(tuning).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** The model maker's recommended values (its model card), or none. */
export function makerTuning(modelId: string): ModelTuning {
  return LOCAL_MODELS_CONFIG.chatSampling[modelId] ?? {};
}

/** What the user changed for `modelId`, as last loaded (the settings query owns it). */
export function savedTuning(modelId: string): ModelTuning {
  return savedPersonalization().modelTuning?.[modelId] ?? {};
}

/** The values a call to `modelId` uses: the user's over the maker's; unset keys are the engine's own. */
export function resolveTuning(modelId: string, saved: ModelTuning = savedTuning(modelId)): ModelTuning {
  return { ...makerTuning(modelId), ...setOnly(saved) };
}

/** A slider's value as the model runs it: tuned, else the engine's. */
export function knobValue(tuning: ModelTuning, key: TuningKnob): number {
  return tuning[key] ?? engine[key];
}

/** `tuning` as AI SDK default call settings: its own names as they are, the rest under the on-device provider. */
export function callSettings(tuning: ModelTuning) {
  const { temperature, topP, topK, presencePenalty, frequencyPenalty, ...onDevice } = tuning;
  return {
    ...setOnly({ temperature, topP, topK, presencePenalty, frequencyPenalty }),
    providerOptions: { [LOCAL_MODELS_CONFIG.provider.id]: setOnly(onDevice) },
  };
}

/** The keys a preset's choices set: choosing one clears them all first. */
function ownedKeys(preset: TuningPreset): Array<keyof ModelTuning> {
  return [...new Set(presets[preset].options.flatMap((option) => Object.keys(option.tuning) as Array<keyof ModelTuning>))];
}

/** The preset choice `saved` matches exactly, or none (Custom). */
export function presetChoice(preset: TuningPreset, saved: ModelTuning): string | undefined {
  const keys = ownedKeys(preset);
  const tuned: Partial<Record<keyof ModelTuning, number>> = saved;
  return presets[preset].options.find((option) => {
    const set: Partial<Record<keyof ModelTuning, number>> = option.tuning;
    return keys.every((key) => tuned[key] === set[key]);
  })?.value;
}

/** `saved` with `preset` set to `choice`: its keys cleared, then the choice's values. */
export function withPreset(preset: TuningPreset, choice: string, saved: ModelTuning): ModelTuning {
  const option = presets[preset].options.find((o) => o.value === choice);
  if (!option) return saved;
  const cleared = Object.fromEntries(Object.entries(saved).filter(([key]) => !ownedKeys(preset).includes(key as keyof ModelTuning)));
  return { ...cleared, ...option.tuning };
}
