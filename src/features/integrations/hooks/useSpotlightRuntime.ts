/**
 * useSpotlightRuntime — mount once (App). Points the meeting indexer at the
 * current setting.
 */

import { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { spotlightService } from '@services/spotlight.service';

export function useSpotlightRuntime(): void {
  const { settings } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'spotlight');

  useEffect(() => {
    spotlightService.configure(enabled).catch((error: unknown) => console.error('[useSpotlightRuntime] configure failed:', error));
  }, [enabled]);
}
