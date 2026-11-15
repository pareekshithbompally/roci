/**
 * useAppleIntelligenceControls — Apple Intelligence row: the on-device model's
 * availability (no permission — only device, setting, model and macOS) and the
 * on/off switch. Apple Speech's own setup (permission, model download) lives on
 * its row in Settings › Capabilities (useAppleSpeechSetup).
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { appleIntelligence, type AppleAvailability } from '@services/ai/apple/appleIntelligence.service';
import { PERMISSIONS_CONFIG } from '@config/permissions.config';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { openNative } from '@features/integrations/utils/openNative';
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

export function useAppleIntelligenceControls(): IntegrationControls {
  const { settings, setSettings } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'appleIntelligence');

  const { data: status } = useQuery({
    queryKey: queryKeys.appleIntelligenceStatus(),
    queryFn: () => appleIntelligence.status(),
    refetchInterval: PERMISSIONS_CONFIG.pollIntervalMs,
  });
  const access = accessOf(status?.availability);

  const openSettings = useCallback(() => {
    openNative('apple-intelligence-settings').catch(report('open settings'));
  }, []);

  const setEnabled = (on: boolean) => {
    // Off in System Settings: that is where it gets turned on.
    if (on && access === 'needs-settings') return openSettings();
    setSettings({ appleIntelligenceIntegration: { enabled: on } });
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
  };
}
