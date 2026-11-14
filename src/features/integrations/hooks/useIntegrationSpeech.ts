/**
 * Integration speech sources — Hex and Apple Speech status as TanStack queries
 * (re-checked on window focus), fetched only while each integration is on.
 * Surfaces (Settings › Audio, composer mic, menubar) read `useIntegrationSpeech`.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { getAppleSpeechStatus, getHexStatus } from '@services/ai/transcription';
import type { IntegrationSpeech } from '@services/ai/transcription';

export function useHexStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.hexStatus(),
    queryFn: getHexStatus,
    enabled,
    refetchOnWindowFocus: true,
  });
}

export function useAppleSpeechStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.appleSpeechStatus(),
    queryFn: getAppleSpeechStatus,
    enabled,
    refetchOnWindowFocus: true,
  });
}

/** Speech sources from integrations that are on (Hex, Apple Speech); each status is fetched only while on. */
export function useIntegrationSpeech(): IntegrationSpeech {
  const { settings } = useSettings();
  const hexOn = isIntegrationEnabled(settings, 'hex');
  const appleOn = isIntegrationEnabled(settings, 'appleIntelligence');
  const { data: hexStatus } = useHexStatus(hexOn);
  const { data: appleStatus } = useAppleSpeechStatus(appleOn);
  return useMemo(() => ({
    ...(hexOn ? { hex: { status: hexStatus } } : {}),
    ...(appleOn ? { appleSpeech: { status: appleStatus } } : {}),
  }), [hexOn, hexStatus, appleOn, appleStatus]);
}
