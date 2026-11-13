/**
 * Transcription engine readiness for the UI. Hex's status is a TanStack Query
 * (re-checked on window focus) and is only fetched when an engine needs it.
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { ENGINES, engineReadiness, getHexStatus } from '@services/ai/transcription';
import type { EngineReadiness, TranscriptionEngine } from '@services/ai/transcription';

export function useHexStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.hexStatus(),
    queryFn: getHexStatus,
    enabled,
    refetchOnWindowFocus: true,
  });
}

/** Readiness of any engine (Settings › Audio lists them all). */
export function useEngineReadiness(): (engine: TranscriptionEngine) => EngineReadiness {
  const { providers } = useSettings();
  const { data: hexStatus } = useHexStatus();
  return useCallback((engine) => engineReadiness(engine, providers, hexStatus), [providers, hexStatus]);
}

/** Readiness of one engine by id; checks Hex only when that engine runs without a provider. */
export function useEngineReady(engineId: string | undefined): boolean {
  const { providers } = useSettings();
  const engine = engineId ? ENGINES[engineId as keyof typeof ENGINES] : undefined;
  const { data: hexStatus } = useHexStatus(!!engine && engine.providerId === null);
  return !!engine && engineReadiness(engine, providers, hexStatus).ready;
}
