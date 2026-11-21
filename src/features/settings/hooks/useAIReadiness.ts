/** What AI is ready now (a text model for chat and summaries, a speech engine for transcripts, the defaults chosen), what is
 *  left to set up, and the one way to set it up. */

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
  /** A chat model is chosen (Default Models). */
  chat: boolean;
  /** A summary model is chosen (Default Models). */
  summary: boolean;
}

export function useAIReadiness(): AIReadiness {
  const { settings, providers } = useSettings();
  const speech = useSpeechInputReady();
  const text = useMemo(
    () => modelSources(providers, settings).some((p) => p.active && p.models && p.models.length > 0),
    [providers, settings],
  );
  const chat = !!settings.chatModel;
  const summary = !!settings.analyzeModel;
  return useMemo(() => ({ text, speech, chat, summary }), [text, speech, chat, summary]);
}

/** What is left to set up, in onboarding's order: a provider first (Providers), then the defaults chat, transcripts and
 *  summaries need (Default Models, with how many are left); null once all is set. */
export type AISetupStep = { panel: 'providers' } | { panel: 'defaultModels'; left: number } | null;

export function aiSetupStep(ready: AIReadiness): AISetupStep {
  if (!ready.text) return { panel: 'providers' };
  const left = [ready.chat, ready.speech, ready.summary].filter((done) => !done).length;
  return left > 0 ? { panel: 'defaultModels', left } : null;
}

/** Opens Settings where the next setup step is done: Providers, or Default Models once a provider is set up. */
export function useOpenAISetup(): () => void {
  const { openSettings } = useAppActions();
  const panel = aiSetupStep(useAIReadiness())?.panel ?? 'providers';
  return useCallback(() => openSettings(panel), [openSettings, panel]);
}
