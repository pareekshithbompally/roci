/** Mount once (App): syncs to-dos to the chosen list and pulls completions when Reminders changes or on focus. */

import { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isTauriEnvironment } from '@services/tauri';
import { remindersService, remindersSync } from '@services/reminders';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';

export function useRemindersRuntime(): void {
  const { settings } = useSettings();
  const enabled = !!settings.remindersIntegration?.enabled;
  const listId = settings.remindersIntegration?.listId;

  useEffect(() => {
    remindersSync.configure({ enabled, listId });
    if (!isTauriEnvironment() || !enabled) return;

    void remindersSync.pull();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pullSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void remindersSync.pull(), INTEGRATIONS_CONFIG.reminders.pullDebounceMs);
    };

    const unlisten = remindersService.onChanged(pullSoon);
    window.addEventListener('focus', pullSoon);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', pullSoon);
      unlisten.then((stop) => stop()).catch((e: unknown) => console.error('[useRemindersRuntime] unlisten failed:', e));
    };
  }, [enabled, listId]);
}
