/**
 * useAppleIntelligenceControls — Apple Intelligence row: the on-device model's
 * availability (no permission — only device, setting, model and macOS), the
 * on/off switch, and Apple Speech's own needs: Speech Recognition (a real macOS
 * permission) and the language model download.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { appleIntelligence, type AppleAvailability } from '@services/ai/apple/appleIntelligence.service';
import { useAppleSpeechStatus } from './useIntegrationSpeech';
import { PERMISSIONS_CONFIG } from '@config/permissions.config';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { openNative } from '@features/integrations/utils/openNative';
import type { PermissionState } from '@services/permissions.service';
import type { IntegrationAccess, IntegrationControls } from '@features/integrations/types';

const COPY = INTEGRATIONS_CONFIG.appleIntelligence;

function report(action: string) {
  return (error: unknown) => console.error(`[useAppleIntelligenceControls] ${action} failed:`, error);
}

/** Model availability in the integration vocabulary. Turned off in System Settings is the one the user can fix. */
function accessOf(availability: AppleAvailability | undefined): IntegrationAccess {
  if (!availability) return 'unknown';
  if (availability === 'available') return 'ready';
  if (availability === 'apple-intelligence-off') return 'needs-settings';
  return 'unavailable';
}

function speechAccessOf(authorization: string): PermissionState {
  if (authorization === 'authorized') return 'ready';
  if (authorization === 'not_determined') return 'needs-request';
  return 'needs-settings';
}

export interface AppleIntelligenceControls extends IntegrationControls {
  contextTokens: number;
  /** Absent when Apple Speech can't run on this Mac (before macOS 26). */
  speech?: {
    access: PermissionState;
    request: () => void;
    openSettings: () => void;
    installed: boolean;
    downloading: boolean;
    download: () => void;
  };
}

export function useAppleIntelligenceControls(): AppleIntelligenceControls {
  const queryClient = useQueryClient();
  const { settings, setSettings } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'appleIntelligence');
  const [downloading, setDownloading] = useState(false);

  const { data: status } = useQuery({
    queryKey: queryKeys.appleIntelligenceStatus(),
    queryFn: () => appleIntelligence.status(),
    refetchInterval: PERMISSIONS_CONFIG.pollIntervalMs,
  });
  const { data: speech } = useAppleSpeechStatus(enabled);
  const access = accessOf(status?.availability);

  const openSettings = useCallback(() => {
    openNative('apple-intelligence-settings').catch(report('open settings'));
  }, []);

  const refreshSpeech = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.appleSpeechStatus() }),
    [queryClient],
  );

  const setEnabled = (on: boolean) => {
    // Off in System Settings: that is where it gets turned on.
    if (on && access === 'needs-settings') return openSettings();
    setSettings({ appleIntelligenceIntegration: { enabled: on } });
  };

  const download = () => {
    setDownloading(true);
    appleIntelligence.speechPrepare(TRANSCRIPTION_CONFIG.language)
      .then(refreshSpeech)
      .catch(report('download speech model'))
      .finally(() => setDownloading(false));
  };

  return {
    access,
    enabled,
    setEnabled,
    openSettings,
    request: openSettings,
    unavailableReason: status && access === 'unavailable'
      ? COPY.unavailable[status.availability as keyof typeof COPY.unavailable] ?? COPY.unavailable.unknown
      : undefined,
    contextTokens: status?.contextTokens ?? 0,
    speech: speech?.available ? {
      access: speechAccessOf(speech.authorization),
      request: () => { appleIntelligence.speechRequestAccess().then(refreshSpeech).catch(report('request speech')); },
      openSettings: () => { openNative('speech-recognition-settings').catch(report('open speech settings')); },
      installed: speech.installed,
      downloading,
      download,
    } : undefined,
  };
}
