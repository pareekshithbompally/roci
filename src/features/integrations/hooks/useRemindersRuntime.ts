/**
 * useRemindersRuntime — mount once (App). Points the to-do sync at the chosen
 * list and pulls completion from Reminders when its database changes (any
 * app) or when Kasset comes to the front.
 */

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
