/**
 * useSpotlightRuntime — mount once (App). Points the meeting indexer at the
 * current setting, once settings have loaded (before that they are fallbacks).
 */

import { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { spotlightService } from '@services/spotlight.service';

export function useSpotlightRuntime(): void {
  const { settings, isLoading } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'spotlight');

  useEffect(() => {
    if (isLoading) return;
    spotlightService.configure(enabled).catch((error: unknown) => console.error('[useSpotlightRuntime] configure failed:', error));
  }, [enabled, isLoading]);
}
