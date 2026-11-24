/** The saved personalization and its edits, through the one settings cache (saved like every setting). */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { PERSONALIZATION_CONFIG, type ModelTuning, type RecognitionBoost } from '@config/personalization.config';
import type { Personalization, VocabularyEntry } from '@shared/types';

const NONE: VocabularyEntry[] = [];
const UNTUNED: Record<string, ModelTuning> = {};

export interface PersonalizationControls {
  vocabulary: VocabularyEntry[];
  recognitionBoost: RecognitionBoost;
  setVocabulary: (vocabulary: VocabularyEntry[]) => void;
  setRecognitionBoost: (boost: RecognitionBoost) => void;
  /** The chosen spoken language (BCP 47); undefined = Automatic, the device's. */
  spokenLanguage: string | undefined;
  setSpokenLanguage: (language: string | undefined) => void;
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
  const queryClient = useQueryClient();

  return {
    vocabulary: personalization?.vocabulary ?? NONE,
    recognitionBoost: personalization?.recognitionBoost ?? PERSONALIZATION_CONFIG.defaultRecognitionBoost,
    setVocabulary: useCallback((vocabulary) => update(() => ({ vocabulary })), [update]),
    setRecognitionBoost: useCallback((recognitionBoost) => update(() => ({ recognitionBoost })), [update]),
    spokenLanguage: personalization?.spokenLanguage,
    setSpokenLanguage: useCallback(
      (spokenLanguage: string | undefined) => {
        update(() => ({ spokenLanguage }));
        // Apple Speech's readiness is per language: its status is re-read for the new one.
        void queryClient.invalidateQueries({ queryKey: queryKeys.appleSpeechStatus() });
      },
      [update, queryClient],
    ),
    modelTuning: personalization?.modelTuning ?? UNTUNED,
    setModelTuning: useCallback(
      (modelId: string, tuning: ModelTuning) => update((current) => ({ modelTuning: { ...current.modelTuning, [modelId]: tuning } })),
      [update],
    ),
  };
}
