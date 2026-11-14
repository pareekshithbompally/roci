/**
 * Speech model hooks for the UI. Hex's status is a TanStack Query (re-checked
 * on window focus) and is only fetched where it matters.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import {
  getHexStatus,
  isSpeechSelectionReady,
  speechModelOptions,
  speechSelectionOf,
} from '@services/ai/transcription';
import type { SpeechModelOption } from '@services/ai/transcription';

export function useHexStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.hexStatus(),
    queryFn: getHexStatus,
    enabled,
    refetchOnWindowFocus: true,
  });
}

/** Every speech model with whether it can run now (Settings › Audio). */
export function useSpeechModelOptions(): SpeechModelOption[] {
  const { providers } = useSettings();
  const { data: hexStatus } = useHexStatus();
  return useMemo(() => speechModelOptions(providers, hexStatus), [providers, hexStatus]);
}

/** Whether the selected speech model can run now (composer mic). Checks Hex only when it's selected. */
export function useSpeechInputReady(): boolean {
  const { settings, providers } = useSettings();
  const selection = speechSelectionOf(settings);
  const { data: hexStatus } = useHexStatus(selection?.provider === TRANSCRIPTION_CONFIG.hexProvider);
  return isSpeechSelectionReady(selection, providers, hexStatus);
}
