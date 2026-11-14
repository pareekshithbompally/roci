/**
 * useNotificationsRuntime — app-lifetime wiring for native notifications:
 * registers the button sets and keeps the muted kinds in step with Settings ›
 * Notifications.
 *
 * Mount once, in a component inside SettingsContext.
 */

import { useEffect, useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_CATEGORIES, NOTIFICATION_KINDS } from '@config/notifications.config';
import { addNotificationCategories, setMutedNotifications } from '@services/notifications';

export function useNotificationsRuntime(): void {
  const { settings } = useSettings();

  useEffect(() => {
    addNotificationCategories(NOTIFICATION_CATEGORIES).catch((error: unknown) =>
      console.error('[useNotificationsRuntime] Registering buttons failed:', error));
  }, []);

  const preferences = settings.notifications ?? DEFAULT_NOTIFICATION_SETTINGS;
  const muted = useMemo(
    () => NOTIFICATION_KINDS.filter(({ kind }) => !preferences[kind]).map(({ kind }) => kind),
    [preferences],
  );
  useEffect(() => {
    setMutedNotifications(muted).catch((error: unknown) =>
      console.error('[useNotificationsRuntime] Updating muted kinds failed:', error));
  }, [muted]);
}
