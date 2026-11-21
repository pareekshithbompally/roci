/** The saved personalization and its edits, through the one settings cache (saved like every setting). */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { PERSONALIZATION_CONFIG, type ModelTuning, type RecognitionBoost } from '@config/personalization.config';
import type { Personalization, VocabularyEntry } from '@shared/types';

const NONE: VocabularyEntry[] = [];
const UNTUNED: Record<string, ModelTuning> = {};

export interface PersonalizationControls {
  vocabulary: VocabularyEntry[];
  recognitionBoost: RecognitionBoost;
  setVocabulary: (vocabulary: VocabularyEntry[]) => void;
  setRecognitionBoost: (boost: RecognitionBoost) => void;
  /** On-device chat models' tuning by model id: only what the user changed. */
  modelTuning: Record<string, ModelTuning>;
  /** Saves `tuning` as all `modelId` changes (an empty one restores its defaults). */
  setModelTuning: (modelId: string, tuning: ModelTuning) => void;
}

/** Writes into the setting by merging into it as saved now, so edits from different pages never overwrite each other. */
export function usePersonalizationUpdate() {
  const { setSettings } = useSettings();
  return useCallback(
    (changes: (current: Personalization) => Partial<Personalization>) =>
      setSettings(({ personalization: current = {} }) => ({ personalization: { ...current, ...changes(current) } })),
    [setSettings],
  );
}

export function usePersonalization(): PersonalizationControls {
  const personalization = useSettings().settings.personalization;
  const update = usePersonalizationUpdate();

  return {
    vocabulary: personalization?.vocabulary ?? NONE,
    recognitionBoost: personalization?.recognitionBoost ?? PERSONALIZATION_CONFIG.defaultRecognitionBoost,
    setVocabulary: useCallback((vocabulary) => update(() => ({ vocabulary })), [update]),
    setRecognitionBoost: useCallback((recognitionBoost) => update(() => ({ recognitionBoost })), [update]),
    modelTuning: personalization?.modelTuning ?? UNTUNED,
    setModelTuning: useCallback(
      (modelId: string, tuning: ModelTuning) => update((current) => ({ modelTuning: { ...current.modelTuning, [modelId]: tuning } })),
      [update],
    ),
  };
}
