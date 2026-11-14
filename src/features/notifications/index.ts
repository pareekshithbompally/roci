/**
 * Notifications Feature Module — app-lifetime wiring for native notifications.
 * The bridge is `@services/notifications`; the switches are Settings › Notifications.
 */

export { useNotificationsRuntime } from './hooks/useNotificationsRuntime';
export { useNotificationControls } from './hooks/useNotificationControls';
export type { NotificationControls } from './hooks/useNotificationControls';
