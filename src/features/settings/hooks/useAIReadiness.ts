/** What AI is ready now (a text model for chat and summaries, a speech engine for transcripts), and the one way to set it up. */

import { useCallback, useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useAppActions } from '@shared/stores/appStore';
import { modelSources } from '@shared/utils/modelResolver';
import { useSpeechInputReady } from './useSpeechModels';

export interface AIReadiness {
  /** Any model to chat and summarize with: the user's providers, or a switched-on integration (Apple Intelligence). */
  text: boolean;
  /** The selected speech engine can transcribe. */
  speech: boolean;
}

export function useAIReadiness(): AIReadiness {
  const { settings, providers } = useSettings();
  const speech = useSpeechInputReady();
  const text = useMemo(
    () => modelSources(providers, settings).some((p) => p.active && p.models && p.models.length > 0),
    [providers, settings],
  );
  return useMemo(() => ({ text, speech }), [text, speech]);
}

/** Opens Settings › Providers, where AI is set up. */
export function useOpenAISetup(): () => void {
  const { openSettings } = useAppActions();
  return useCallback(() => openSettings('providers'), [openSettings]);
}
