/**
 * useSpotlightControls — Spotlight row: on/off. No macOS permission is involved.
 */

import { useSettings } from '@shared/contexts/SettingsContext';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import type { IntegrationControls } from '@features/integrations/types';

export function useSpotlightControls(): IntegrationControls {
  const { settings, setSettings } = useSettings();
  return {
    access: 'ready',
    enabled: isIntegrationEnabled(settings, 'spotlight'),
    setEnabled: (on) => setSettings({ spotlightIntegration: { enabled: on } }),
  };
}
