/**
 * Notification service for Tauri
 * Provides unified notification API with graceful fallbacks
 */

import { NotificationType, NOTIFICATION_TEMPLATES } from '../../src/config/notifications.config';
import { isTauriEnvironment } from './environment.service';
import type { NotificationOptions } from './types';

interface NotifyWithActionsOptions {
  title: string;
  body: string;
  actionTypeId: string;
}

class NotificationService {
  private isInitialized = false;
  private sendNotification: any = null;
  private isPermissionGranted: any = null;
  private actionCallback: ((typeId: string, actionId: string) => void) | null = null;

  /**
   * Initialize notification service
   * Must be called before using notifications
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (isTauriEnvironment()) {
      try {
        const notificationModule = await import('@tauri-apps/plugin-notification');
        this.sendNotification = notificationModule.sendNotification;
        this.isPermissionGranted = notificationModule.isPermissionGranted;

        // Register action types for recording timeout alert
        await notificationModule.registerActionTypes([
          {
            id: 'recording_timeout',
            actions: [
              { id: 'keep_recording', title: 'Keep Recording' },
              { id: 'stop_now', title: 'Stop Now' },
            ],
          },
        ]);

        // Route notification action callbacks to registered handler
        notificationModule.onAction((notification: any) => {
          const typeId = notification.actionTypeId ?? notification.notification?.actionTypeId;
          const actionId = notification.action?.id ?? notification.actionId;
          if (typeId && actionId && this.actionCallback) {
            this.actionCallback(typeId, actionId);
          }
        }).catch((e: unknown) => {
          console.warn('[NotificationService] onAction setup failed:', e);
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
   * Request notification permission
   */
  async requestPermission(): Promise<boolean> {
    await this.initialize();

    if (isTauriEnvironment() && this.isPermissionGranted) {
      const granted = await this.isPermissionGranted();
      return granted;
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
   * The actionTypeId must match a type registered via registerActionTypes in initialize().
   */
  async notifyWithActions(options: NotifyWithActionsOptions): Promise<void> {
    await this.initialize();

    if (!this.sendNotification) {
      console.log(`[Notification] ${options.title}:`, options.body);
      return;
    }

    try {
      await this.sendNotification({
        title: options.title,
        body: options.body,
        actionTypeId: options.actionTypeId,
      });
    } catch (error) {
      console.error('Failed to send actionable notification:', error);
    }
  }

  /**
   * Register a callback to receive notification action events.
   * Called by RecordingContext to handle "Keep Recording" / "Stop Now" clicks.
   */
  setActionCallback(cb: ((typeId: string, actionId: string) => void) | null): void {
    this.actionCallback = cb;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
