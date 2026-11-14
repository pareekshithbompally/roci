/**
 * useAppleNotesRuntime — mount once (App). Points the meeting → note sync at
 * the current setting; meetings are sent from the single meeting-save point.
 */

import { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { appleNotesSync } from '@services/appleNotes';

export function useAppleNotesRuntime(): void {
  const { settings } = useSettings();
  const enabled = !!settings.appleNotesIntegration?.enabled;
  const since = settings.appleNotesIntegration?.since;

  useEffect(() => {
    appleNotesSync.configure({ enabled, since });
  }, [enabled, since]);
}
