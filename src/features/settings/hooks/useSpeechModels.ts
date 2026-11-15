/**
 * Speech model hooks for the UI: what Settings › Capabilities and the composer mic can
 * use. Keyless sources: Kasset's own engine (its speech local models) and the
 * integrations (Hex, Apple Speech) from features/integrations.
 */

import { useMemo } from 'react';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useIntegrationSpeech } from '@features/integrations';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import {
  getAppleSpeechStatus,
  getHexStatus,
  isSpeechSelectionReady,
  liveEngineFor,
  speechModelOptions,
  speechSelectionOf,
} from '@services/ai/transcription';
import type { LiveEngine, SpeechModelOption, SpeechSources } from '@services/ai/transcription';
import { getLocalModels } from '@services/localModels.service';
import type { LocalModel } from '@services/localModels.service';
import { useLocalModels } from './useLocalModels';

const speechModels = (models: LocalModel[]) => models.filter((m) => m.kind === 'speech');

/** Every keyless speech source: this Mac's engine plus the integrations that are on. */
function useSpeechSources(): SpeechSources {
  const integrations = useIntegrationSpeech();
  const { data: models } = useLocalModels();
  return useMemo(() => ({ ...integrations, ...(models ? { onDevice: { models: speechModels(models) } } : {}) }), [integrations, models]);
}

/**
 * Every speech model with whether it can run now (Settings › Capabilities).
 * Audio-input models come from models.dev, so the list refreshes once the catalog loads.
 */
export function useSpeechModelOptions(): SpeechModelOption[] {
  const { providers } = useSettings();
  const sources = useSpeechSources();
  const catalogLoaded = useModelCatalog();
  return useMemo(
    () => speechModelOptions(providers, sources),
    // catalogLoaded: capabilitiesOf() reads the catalog it loads.
    [providers, sources, catalogLoaded],
  );
}

/** The live engine and model a dictation streams to. */
export interface LiveDictation {
  engine: LiveEngine;
  model: string;
}

/**
 * How dictation transcribes now: live when Real-time transcription is on and
 * the chosen speech model streams and is ready; null → it transcribes the
 * clip when it ends.
 */
export function useLiveDictation(): LiveDictation | null {
  const { settings } = useSettings();
  const options = useSpeechModelOptions();
  const { liveTranscription, transcriptionProvider, transcriptionModel } = settings;
  return useMemo(() => {
    const selection = speechSelectionOf({ transcriptionProvider, transcriptionModel });
    if (!liveTranscription || !selection) return null;
    const option = options.find((o) => o.provider === selection.provider && o.model === selection.model);
    const engine = liveEngineFor(selection.provider);
    return option?.live && option.ready && engine ? { engine, model: selection.model } : null;
  }, [liveTranscription, transcriptionProvider, transcriptionModel, options]);
}

/** Whether the selected speech model can run now (composer mic). */
export function useSpeechInputReady(): boolean {
  const { settings, providers } = useSettings();
  const sources = useSpeechSources();
  useModelCatalog(); // re-render once audio-input capabilities are known
  return isSpeechSelectionReady(speechSelectionOf(settings), providers, sources);
}

/**
 * Every keyless source read again now, for a pick made outside the window
 * (the tray): a model may have been removed or Hex quit since the list was built.
 */
export async function freshSpeechSources(): Promise<SpeechSources> {
  const [models, hex, apple] = await Promise.all([
    queryClient.fetchQuery({ queryKey: queryKeys.localModels(), queryFn: getLocalModels, staleTime: 0 }),
    queryClient.fetchQuery({ queryKey: queryKeys.hexStatus(), queryFn: getHexStatus, staleTime: 0 }),
    queryClient.fetchQuery({ queryKey: queryKeys.appleSpeechStatus(), queryFn: getAppleSpeechStatus, staleTime: 0 }),
  ]);
  return { onDevice: { models: speechModels(models) }, hex: { status: hex }, appleSpeech: { status: apple } };
}
