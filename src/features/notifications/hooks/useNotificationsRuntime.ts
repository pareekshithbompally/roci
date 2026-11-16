/** Mount once inside SettingsContext: registers button sets and keeps muted kinds in step with Settings. */

import { useEffect, useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_CATEGORIES, NOTIFICATION_KINDS } from '@config/notifications.config';
import { addNotificationCategories, setMutedNotifications } from '@services/notifications';
import { platform } from '@platform/index';

export function useNotificationsRuntime(): void {
  const { settings, isLoading } = useSettings();

  useEffect(() => {
    if (!platform.hasNotifications) return;
    addNotificationCategories(NOTIFICATION_CATEGORIES).catch((error: unknown) =>
      console.error('[useNotificationsRuntime] Registering buttons failed:', error));
  }, []);

  const preferences = settings.notifications ?? DEFAULT_NOTIFICATION_SETTINGS;
  const muted = useMemo(
    () => NOTIFICATION_KINDS.filter(({ kind }) => !preferences[kind]).map(({ kind }) => kind),
    [preferences],
  );
  useEffect(() => {
    if (!platform.hasNotifications || isLoading) return;
    setMutedNotifications(muted).catch((error: unknown) =>
      console.error('[useNotificationsRuntime] Updating muted kinds failed:', error));
  }, [muted, isLoading]);
}
