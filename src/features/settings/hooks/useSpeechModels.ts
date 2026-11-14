/**
 * Speech model hooks for the UI: what Settings › Capabilities and the composer mic can
 * use. Integration sources (Hex, Apple Speech) come from features/integrations.
 */

import { useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useIntegrationSpeech } from '@features/integrations';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import {
  isSpeechSelectionReady,
  speechModelOptions,
  speechSelectionOf,
} from '@services/ai/transcription';
import type { SpeechModelOption } from '@services/ai/transcription';

/**
 * Every speech model with whether it can run now (Settings › Capabilities).
 * Audio-input models come from models.dev, so the list refreshes once the catalog loads.
 */
export function useSpeechModelOptions(): SpeechModelOption[] {
  const { providers } = useSettings();
  const integrations = useIntegrationSpeech();
  const catalogLoaded = useModelCatalog();
  return useMemo(
    () => speechModelOptions(providers, integrations),
    // catalogLoaded: capabilitiesOf() reads the catalog it loads.
    [providers, integrations, catalogLoaded],
  );
}

/** Whether the selected speech model can run now (composer mic). */
export function useSpeechInputReady(): boolean {
  const { settings, providers } = useSettings();
  const integrations = useIntegrationSpeech();
  useModelCatalog(); // re-render once audio-input capabilities are known
  return isSpeechSelectionReady(speechSelectionOf(settings), providers, integrations);
}
