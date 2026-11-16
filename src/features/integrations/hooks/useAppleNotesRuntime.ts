/** Mount once (App): points the meeting → note sync at the current setting. */

import { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { appleNotesSync } from '@services/appleNotes';
import { isIntegrationEnabled } from '@shared/utils/integrations';

export function useAppleNotesRuntime(): void {
  const { settings } = useSettings();
  const enabled = isIntegrationEnabled(settings, 'appleNotes');
  const since = settings.appleNotesIntegration?.since;

  useEffect(() => {
    appleNotesSync.configure({ enabled, since });
  }, [enabled, since]);
}
