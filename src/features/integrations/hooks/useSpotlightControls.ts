/**
 * useSpotlightControls — Spotlight row: whether this build can index (no macOS
 * permission) and the on/off switch.
 */

import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@shared/contexts/SettingsContext';
import { queryKeys } from '@shared/query/queryKeys';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { spotlightService } from '@services/spotlight.service';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import type { IntegrationAccess, IntegrationControls } from '@features/integrations/types';

const COPY = INTEGRATIONS_CONFIG.spotlight;

export function useSpotlightControls(): IntegrationControls {
  const { settings, setSettings } = useSettings();
  const { data: status } = useQuery({
    queryKey: queryKeys.spotlight(),
    queryFn: () => spotlightService.status(),
    staleTime: Infinity,
  });

  const access: IntegrationAccess = !status ? 'unknown' : status.supported ? 'ready' : 'unavailable';

  return {
    access,
    enabled: isIntegrationEnabled(settings, 'spotlight'),
    setEnabled: (on) => setSettings({ spotlightIntegration: { enabled: on } }),
    unavailableReason: access === 'unavailable' ? COPY.unavailable : undefined,
  };
}
