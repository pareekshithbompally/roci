/** The languages the chosen speech model takes, for the Spoken Language menu; null when the model is told none. */

import { useSettings } from '@shared/contexts/SettingsContext';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { speechSelectionOf } from '@services/ai/transcription';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { useAppleSpeechStatus } from '@features/integrations';

export interface SpokenLanguages {
  /** The chosen speech model's name. */
  model: string;
  /** What it takes (BCP 47, its own spelling). */
  languages: string[];
  /** It tells the language itself when it doesn't take the device's. */
  detects: boolean;
}

export function useSpokenLanguages(): SpokenLanguages | null {
  const selection = speechSelectionOf(useSettings().settings);
  const onDevice = selection?.provider === TRANSCRIPTION_CONFIG.onDevice.provider;
  const apple = selection?.provider === TRANSCRIPTION_CONFIG.appleSpeech.provider;
  const { data: models } = useLocalModels();
  const { data: appleStatus } = useAppleSpeechStatus(apple);

  if (apple) {
    const languages = appleStatus?.languages ?? [];
    return languages.length ? { model: TRANSCRIPTION_CONFIG.appleSpeech.label, languages, detects: false } : null;
  }
  const model = onDevice ? models?.find((m) => m.id === selection.model) : undefined;
  if (!model?.languages.length) return null; // cloud and Hex models tell the language themselves
  return { model: model.name, languages: model.languages, detects: model.detectsLanguage };
}
