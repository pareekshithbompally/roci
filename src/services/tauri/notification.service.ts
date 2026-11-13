/**
 * Notification service for Tauri
 * Provides unified notification API with graceful fallbacks
 */

import { invoke } from '@tauri-apps/api/core';
import type { Options as PluginNotificationOptions } from '@tauri-apps/plugin-notification';

/** Action payload delivered by the notification bridge (plugin + custom events). */
interface NotificationActionPayload extends PluginNotificationOptions {
  actionTypeId?: string;
  actionId?: string;
  action?: { id?: string };
  extra?: Record<string, unknown>;
  notification?: {
    actionTypeId?: string;
    actionId?: string;
    extra?: Record<string, unknown>;
  };
}
import { NotificationType, NOTIFICATION_TEMPLATES } from '@config/notifications.config';
import { isTauriEnvironment } from './environment.service';
import type { NotificationOptions } from './types';

interface NotifyWithActionsOptions {
  title: string;
  body: string;
  actionTypeId: string;
  extra?: Record<string, unknown>;
}

interface ScheduleNotificationOptions {
  id: number;
  title: string;
  body: string;
  at: Date;
  actionTypeId?: string;
  extra?: Record<string, unknown>;
}

class NotificationService {
  private isInitialized = false;
  private sendNotification: ((options: NotificationOptions) => void | Promise<void>) | null = null;
  private isPermissionGranted: (() => Promise<boolean>) | null = null;
  private actionHandlers = new Map<string, Set<(actionId: string, extra?: Record<string, unknown>) => void>>();
  private notificationModule: typeof import('@tauri-apps/plugin-notification') | null = null;
  private registeredActionTypes = new Map<string, Array<{ id: string; title: string }>>();

  /**
   * Initialize notification service
   * Must be called before using notifications
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (isTauriEnvironment()) {
      try {
        const notificationModule = await import('@tauri-apps/plugin-notification');
        this.notificationModule = notificationModule;
        this.sendNotification = notificationModule.sendNotification;
        this.isPermissionGranted = notificationModule.isPermissionGranted;

        // Register action types for interactive notifications
        // Store them locally for use with our custom mac-notification-sys command
        const actionTypes = [
            {
              id: 'calendar_event',
              actions: [],
            },
            {
              id: 'recording_timeout',
              actions: [
                { id: 'keep_recording', title: 'Keep Recording' },
                { id: 'stop_now', title: 'Stop Now' },
              ],
            },
            {
              id: 'recording_autostop',
              actions: [],
            },
            {
              id: 'todo_reminder',
              actions: [
                { id: 'view_meeting', title: 'View Meeting', foreground: true },
                { id: 'snooze_15', title: 'Snooze 15 min' },
                { id: 'dismiss', title: 'Dismiss' },
              ],
            },
            {
              id: 'meeting_starting',
              actions: [
                { id: 'join_and_record', title: 'Join & Record', foreground: true },
                { id: 'record_only', title: 'Record', foreground: true },
                { id: 'snooze', title: 'Snooze' },
              ],
            },
            {
              id: 'meeting_starting_no_url',
              actions: [
                { id: 'record_only', title: 'Record', foreground: true },
                { id: 'snooze', title: 'Snooze' },
              ],
            },
          ];

        // Store action type definitions for lookup when sending notifications
        for (const at of actionTypes) {
          this.registeredActionTypes.set(at.id, at.actions.map(a => ({ id: a.id, title: a.title })));
        }

        // Also register with the plugin (for scheduled notifications via plugin invoke)
        try {
          await notificationModule.registerActionTypes(actionTypes);
        } catch {
          // registerActionTypes not available on desktop — our custom command handles actions instead
        }

        // Route notification action callbacks to registered handler by typeId
        // Listen to both the plugin's onAction (for scheduled/mobile) and our custom event (for actionable desktop)
        notificationModule.onAction((notification: NotificationActionPayload) => {
          const typeId = notification.actionTypeId ?? notification.notification?.actionTypeId;
          const actionId = notification.action?.id ?? notification.actionId;
          const extra = notification.notification?.extra ?? notification.extra;
          if (typeId && actionId) {
            const handlers = this.actionHandlers.get(typeId);
            if (handlers) {
              for (const handler of handlers) {
                handler(actionId, extra);
              }
            }
          }
        }).catch((e: unknown) => {
          console.warn('[NotificationService] onAction setup failed:', e);
        });

        // Listen for our custom mac-notification-sys action events from Rust
        import('@tauri-apps/api/event').then(({ listen }) => {
          listen<{ actionTypeId: string; actionId: string; extra: Record<string, string> }>(
            'notification-action',
            (event) => {
              const { actionTypeId, actionId, extra } = event.payload;
              if (actionTypeId && actionId && actionId !== '__dismissed__') {
                const handlers = this.actionHandlers.get(actionTypeId);
                if (handlers) {
                  for (const handler of handlers) {
                    handler(actionId, extra);
                  }
                }
              }
            }
          );
        }).catch((e: unknown) => {
          console.warn('[NotificationService] notification-action listener setup failed:', e);
        });

        this.isInitialized = true;
      } catch (error) {
        console.warn('Failed to initialize Tauri notifications:', error);
        this.fallbackToBrowserNotifications();
      }
    } else {
      this.fallbackToBrowserNotifications();
    }
  }

  private fallbackToBrowserNotifications(): void {
    if ('Notification' in window) {
      this.sendNotification = async (options: NotificationOptions) => {
        if (Notification.permission === 'granted') {
          new Notification(options.title, { body: options.body });
        }
      };
      this.isPermissionGranted = async () => Notification.permission === 'granted';
      this.isInitialized = true;
    }
  }

  /**
   * Request notification permission.
   * In Tauri, uses the plugin's requestPermission if not already granted.
   */
  async requestPermission(): Promise<boolean> {
    await this.initialize();

    if (isTauriEnvironment() && this.notificationModule) {
      try {
        let granted = await this.notificationModule.isPermissionGranted();
        if (!granted) {
          const result = await this.notificationModule.requestPermission();
          granted = result === 'granted';
        }
        return granted;
      } catch (error) {
        console.warn('[NotificationService] Permission check/request failed:', error);
        return false;
      }
    } else if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  /**
   * Send a notification using predefined templates
   */
  async notify(type: NotificationType, customBody?: string): Promise<void> {
    await this.initialize();

    if (!this.sendNotification) {
      console.log(`[Notification] ${type}:`, customBody || NOTIFICATION_TEMPLATES[type].body);
      return;
    }

    const template = NOTIFICATION_TEMPLATES[type];
    const options: NotificationOptions = {
      title: template.title,
      body: customBody || template.body,
    };

    try {
      await this.sendNotification(options);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  /**
   * Send a custom notification
   */
  async notifyCustom(options: NotificationOptions): Promise<void> {
    await this.initialize();

    if (!this.sendNotification) {
      console.log(`[Notification] ${options.title}:`, options.body);
      return;
    }

    try {
      await this.sendNotification(options);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  /**
   * Send a notification with action buttons (macOS actionable notification).
   * Uses a custom Rust command that calls mac-notification-sys directly,
   * because the Tauri notification plugin (v2) desktop backend ignores
   * actionTypeId and action buttons (only supported on mobile).
   *
   * Listens for the user's action via the "notification-action" Tauri event.
   */
  async notifyWithActions(options: NotifyWithActionsOptions): Promise<void> {
    await this.initialize();

    if (isTauriEnvironment()) {
      try {
        // Build actions array from registered action types
        const actions = this.getActionsForType(options.actionTypeId);
        if (actions.length === 0) {
          console.warn('[NotificationService] No actions registered for type:', options.actionTypeId);
          // Fall through to basic notification
        } else {
          await invoke('send_actionable_notification', {
            options: {
              title: options.title,
              body: options.body,
              actionTypeId: options.actionTypeId,
              actions,
              extra: options.extra ? Object.fromEntries(
                Object.entries(options.extra).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
              ) : {},
            },
          });
          return;
        }
      } catch (error) {
        console.error('[NotificationService] Failed to send actionable notification:', error);
      }
    }

    // Fallback to basic notification (no actions)
    if (this.sendNotification) {
      try {
        await this.sendNotification({ title: options.title, body: options.body });
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    } else {
      console.log(`[Notification] ${options.title}:`, options.body);
    }
  }

  /**
   * Schedule a notification to fire at a specific future time.
   * Uses Tauri's `plugin:notification|notify` IPC command with Schedule.at().
   *
   * NOTE: The JS-side `sendNotification()` uses `new window.Notification()` (browser API)
   * which fires immediately and ignores the `schedule` field. We must use `invoke()` to
   * go through the Rust backend where Schedule is properly handled.
   */
  async scheduleNotification(options: ScheduleNotificationOptions): Promise<boolean> {
    await this.initialize();

    if (!isTauriEnvironment()) {
      console.warn('[NotificationService] Cannot schedule: not in Tauri environment');
      return false;
    }

    try {
      const notification = {
        id: options.id,
        title: options.title,
        body: options.body,
        schedule: {
          at: {
            date: options.at.toISOString(),
            repeating: false,
            allowWhileIdle: true,
          },
        },
        actionTypeId: options.actionTypeId,
        extra: options.extra ? Object.fromEntries(
          Object.entries(options.extra).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
        ) : undefined,
      };
      await invoke('plugin:notification|notify', { notification });
      console.log(`[NotificationService] Scheduled notification ${options.id} for ${options.at.toISOString()}`);
      return true;
    } catch (error) {
      console.error('[NotificationService] Failed to schedule notification:', error);
      return false;
    }
  }

  /**
   * Cancel one or more scheduled/pending notifications by ID.
   */
  async cancelNotification(ids: number[]): Promise<boolean> {
    await this.initialize();

    if (!this.notificationModule) return false;

    try {
      await this.notificationModule.cancel(ids);
      return true;
    } catch (error) {
      console.error('[NotificationService] Failed to cancel notifications:', error);
      return false;
    }
  }

  /**
   * Get all pending (scheduled but not yet fired) notifications.
   */
  async getPendingNotifications(): Promise<Array<{ id: number; schedule?: unknown }>> {
    await this.initialize();

    if (!this.notificationModule) return [];

    try {
      return await this.notificationModule.pending();
    } catch (error) {
      console.error('[NotificationService] Failed to get pending notifications:', error);
      return [];
    }
  }

  /**
   * Look up registered actions for a given action type ID.
   */
  private getActionsForType(actionTypeId: string): Array<{ id: string; title: string }> {
    return this.registeredActionTypes.get(actionTypeId) ?? [];
  }

  /**
   * Register a handler for a specific notification action type.
   * Multiple handlers can coexist — one per typeId.
   * Returns an unsubscribe function.
   */
  onActionType(typeId: string, handler: (actionId: string, extra?: Record<string, unknown>) => void): () => void {
    let handlers = this.actionHandlers.get(typeId);
    if (!handlers) {
      handlers = new Set();
      this.actionHandlers.set(typeId, handlers);
    }
    handlers.add(handler);
    return () => {
      const set = this.actionHandlers.get(typeId);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.actionHandlers.delete(typeId);
        }
      }
    };
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
