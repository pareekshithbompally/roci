/** Speech models for Settings and the composer mic; keyless sources are local models, Hex and Apple Speech. */

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
  openLiveStream,
  runsLive,
  speechModelOptions,
  speechSelectionOf,
} from '@services/ai/transcription';
import type { LiveStream, SpeechModelOption, SpeechSources } from '@services/ai/transcription';
import { getLocalModels } from '@services/localModels.service';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { MEETING_LIVE_CONFIG } from '@config/meetingLive.config';
import type { LocalModel } from '@services/localModels.service';
import { useLocalModels } from '@shared/hooks/useLocalModels';

const speechModels = (models: LocalModel[]) => models.filter((m) => m.kind === 'speech');

/** Every keyless speech source: this Mac's engine plus the integrations that are on. */
function useSpeechSources(): SpeechSources {
  const integrations = useIntegrationSpeech();
  const { data: models } = useLocalModels();
  return useMemo(() => ({ ...integrations, ...(models ? { onDevice: { models: speechModels(models) } } : {}) }), [integrations, models]);
}

/** Every speech model and whether it can run now; refreshes once the models.dev catalog loads. */
export function useSpeechModelOptions(): SpeechModelOption[] {
  const { providers } = useSettings();
  const sources = useSpeechSources();
  const catalogLoaded = useModelCatalog();
  return useMemo(
    () => speechModelOptions(providers, sources),
    // catalogLoaded: profileOf() reads the catalog it loads.
    [providers, sources, catalogLoaded],
  );
}

/** A dictation that streams: how to open its stream. */
export interface LiveDictation {
  open: () => Promise<LiveStream>;
}

/** The chosen speech model's option (what it is, whether it can run, whether it streams); undefined when none is chosen. */
export function useSelectedSpeechOption(): SpeechModelOption | undefined {
  const { settings } = useSettings();
  const options = useSpeechModelOptions();
  const { transcriptionProvider, transcriptionModel } = settings;
  return useMemo(() => {
    const selection = speechSelectionOf({ transcriptionProvider, transcriptionModel });
    return selection ? options.find((o) => o.provider === selection.provider && o.model === selection.model) : undefined;
  }, [transcriptionProvider, transcriptionModel, options]);
}

/** Live dictation is tried when Live Transcript is on and the model's engine streams (the clip is kept, so a refusal loses nothing);
 *  null → transcribe the clip at the end. */
export function useLiveDictation(): LiveDictation | null {
  const { settings, providers } = useSettings();
  const option = useSelectedSpeechOption();
  const live = !!settings.liveTranscription;
  return useMemo(() => {
    if (!live || !option?.ready || !runsLive(option, providers, 1)) return null;
    return { open: () => openLiveStream(option, providers) };
  }, [live, option, providers]);
}

/** What the chosen speech model does live, for the Live Transcript footer: a model known to stream streams in meetings
 *  when its engine runs a stream per side, else dictation only; a cloud model is tried; no streaming engine means chunks. */
export function useLiveModeLine(): string | null {
  const { providers } = useSettings();
  const option = useSelectedSpeechOption();
  if (!option) return null;
  const { liveCopy } = TRANSCRIPTION_CONFIG;
  if (!runsLive(option, providers, 1)) return liveCopy.chunks;
  if (!option.live) return liveCopy.tried;
  return runsLive(option, providers, MEETING_LIVE_CONFIG.sides.systemAndMicrophone.length) ? liveCopy.streams : liveCopy.dictationOnly;
}

/** Whether the selected speech model can run now (composer mic). */
export function useSpeechInputReady(): boolean {
  const { settings, providers } = useSettings();
  const sources = useSpeechSources();
  useModelCatalog(); // re-render once audio-input capabilities are known
  return isSpeechSelectionReady(speechSelectionOf(settings), providers, sources);
}

/** Re-read keyless sources for a tray pick, since a model may have gone or Hex quit since the list was built. */
export async function freshSpeechSources(): Promise<SpeechSources> {
  const [models, hex, apple] = await Promise.all([
    queryClient.fetchQuery({ queryKey: queryKeys.localModels(), queryFn: getLocalModels, staleTime: 0 }),
    queryClient.fetchQuery({ queryKey: queryKeys.hexStatus(), queryFn: getHexStatus, staleTime: 0 }),
    queryClient.fetchQuery({ queryKey: queryKeys.appleSpeechStatus(), queryFn: getAppleSpeechStatus, staleTime: 0 }),
  ]);
  return { onDevice: { models: speechModels(models) }, hex: { status: hex }, appleSpeech: { status: apple } };
}
