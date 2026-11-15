/** Notes row: Automation consent and on/off; turning on records the time, so only later meetings go to Notes. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { appleNotesService } from '@services/appleNotes';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { useSystemAccess } from './useSystemAccess';
import type { IntegrationControls } from '@features/integrations/types';

const SOURCE = {
  id: 'apple-notes',
  check: () => appleNotesService.access(false),
  request: async () => (await appleNotesService.access(true)) === 'authorized',
  settingsPane: 'automation-settings',
} as const;

export function useAppleNotesControls(): IntegrationControls {
  const { settings, setSettings } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'appleNotes');
  const { access, requestAccess, openSettings } = useSystemAccess(SOURCE);

  const setEnabled = useCallback(async (on: boolean) => {
    if (!on) return setSettings({ appleNotesIntegration: { enabled: false } });
    // Ask while macOS can still prompt; once denied, only Settings can change it.
    if (access === 'needs-settings') return openSettings();
    if (access === 'needs-request' && !(await requestAccess())) return;
    setSettings({ appleNotesIntegration: { enabled: true, since: Date.now() } });
  }, [access, openSettings, requestAccess, setSettings]);

  return {
    access,
    enabled,
    setEnabled: (on) => { setEnabled(on).catch((e: unknown) => console.error('[useAppleNotesControls] toggle failed:', e)); },
    request: () => { requestAccess().catch((e: unknown) => console.error('[useAppleNotesControls] request failed:', e)); },
    openSettings,
  };
}
