/** Mount once (App): points the meeting indexer at the current setting once settings have loaded. */

import { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { spotlightService } from '@services/spotlight.service';
import { platform } from '@platform/index';

export function useSpotlightRuntime(): void {
  const { settings, isLoading } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'spotlight');

  useEffect(() => {
    if (!platform.hasSpotlight || isLoading) return;
    spotlightService.configure(enabled).catch((error: unknown) => console.error('[useSpotlightRuntime] configure failed:', error));
  }, [enabled, isLoading]);
}
