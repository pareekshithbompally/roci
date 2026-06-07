/**
 * Notification Scheduler
 *
 * Unified, OS-level notification scheduling service. Replaces unreliable
 * setTimeout/setInterval with native OS-scheduled notifications
 * (Tauri plugin:notification|notify → macOS UNUserNotificationCenter)
 * for ALL future-timed notifications.
 *
 * Design:
 *  - Purely imperative singleton (no React state), following the same
 *    pattern as reminderService / notificationService / calendarService.
 *  - No polling. Scheduling delegates to the OS. Reconciliation runs ONLY
 *    on startup to recover from crashes/restarts.
 *  - Deterministic notification IDs (hash of key) prevent duplicates and
 *    guarantee idempotent schedule/cancel.
 */

import { notificationService } from './tauri/notification.service';
import { isTauriEnvironment } from './tauri/environment.service';

// ── Types ──────────────────────────────────────────────────────────

export interface NotificationSchedule {
  key: string;
  notificationId: number;
  at: Date;
  title: string;
  body: string;
  actionTypeId: string;
  extra?: Record<string, unknown>;
}

export interface ScheduleOptions {
  at: Date;
  title: string;
  body: string;
  actionTypeId: string;
  extra?: Record<string, unknown>;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Deterministic 32-bit integer from any string.
 * Must be non-zero (Tauri notification requirement).
 * Same DJB2-style hash used by hashToNotificationId() in todo.utils.ts.
 */
export function hashStringToId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// ── Scheduler ──────────────────────────────────────────────────────

class NotificationScheduler {
  /** Locally-tracked scheduled notifications (key → entry) */
  private entries: Map<string, NotificationSchedule> = new Map();

  /** True after initial reconcile() completes. */
  private reconciled = false;

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Schedule a notification at a specific time via the OS.
   *
   * If a notification with this key already exists, it is atomically
   * canceled and rescheduled with the new parameters.
   *
   * Returns true if the OS accepted the schedule request.
   */
  async schedule(key: string, options: ScheduleOptions): Promise<boolean> {
    if (!isTauriEnvironment()) {
      return false;
    }

    const fireAt = options.at;

    if (fireAt.getTime() <= Date.now()) {
      return false;
    }

    await this.cancelLocal(key);

    const notificationId = hashStringToId(key);

    const ok = await notificationService.scheduleNotification({
      id: notificationId,
      title: options.title,
      body: options.body,
      at: fireAt,
      actionTypeId: options.actionTypeId,
      extra: options.extra,
    });

    if (ok) {
      this.entries.set(key, {
        key,
        notificationId,
        at: fireAt,
        title: options.title,
        body: options.body,
        actionTypeId: options.actionTypeId,
        extra: options.extra,
      });
    }

    return ok;
  }

  /**
   * Schedule multiple notifications efficiently.
   * Each key is atomically canceled and rescheduled.
   */
  async scheduleBatch(items: Array<{ key: string } & ScheduleOptions>): Promise<void> {
    await Promise.allSettled(items.map((item) => this.schedule(item.key, item)));
  }

  /**
   * Cancel a single notification by key.
   */
  async cancel(key: string): Promise<void> {
    await this.cancelLocal(key);
  }

  /**
   * Cancel ALL notifications whose actionTypeId matches.
   * Used for bulk rescheduling (calendar refresh, recording stop).
   */
  async cancelAllForType(actionTypeId: string): Promise<void> {
    const keys = Array.from(this.entries.values())
      .filter((e) => e.actionTypeId === actionTypeId)
      .map((e) => e.key);

    await Promise.allSettled(keys.map((key) => this.cancelLocal(key)));
  }

  /** All locally-tracked scheduled notifications (for debugging / reconciliation). */
  getScheduled(): NotificationSchedule[] {
    return Array.from(this.entries.values());
  }

  /** Number of locally-tracked entries. */
  get scheduledCount(): number {
    return this.entries.size;
  }

  /** Check if a key is currently tracked. */
  isScheduled(key: string): boolean {
    return this.entries.has(key);
  }

  // ── Startup reconciliation ───────────────────────────────────────

  /**
   * Reconcile local tracking with the OS pending-queue on startup.
   *
   * Covers the case where the app crashed/restarted while notifications
   * were still pending. Cancels stale local entries, and re-registers
   * orphaned OS notifications so we know about them.
   *
   * Call once after notificationService.initialize().
   */
  async reconcile(): Promise<void> {
    if (!isTauriEnvironment() || this.reconciled) return;

    try {
      const pending = await notificationService.getPendingNotifications();
      const pendingIds = new Set(pending.map((n) => n.id));

      let rescheduled = 0;
      let stale = 0;

      for (const [key, entry] of this.entries) {
        if (!pendingIds.has(entry.notificationId)) {
          if (entry.at.getTime() > Date.now()) {
            // Future, missing — reschedule
            const ok = await notificationService.scheduleNotification({
              id: entry.notificationId,
              title: entry.title,
              body: entry.body,
              at: entry.at,
              actionTypeId: entry.actionTypeId,
              extra: entry.extra,
            });
            if (!ok) this.entries.delete(key);
            rescheduled++;
          } else {
            // Past, already fired — clean up
            this.entries.delete(key);
            stale++;
          }
        }
      }

      // Cancel stale OS notifications we don't track
      await Promise.allSettled(
        pending
          .filter((p) => !Array.from(this.entries.values()).some((e) => e.notificationId === p.id))
          .map((p) => notificationService.cancelNotification([p.id]))
      );

      this.reconciled = true;

      if (rescheduled > 0 || stale > 0) {
        console.log(
          `[NotificationScheduler] Reconciled: %d rescheduled, %d stale, %d tracked`,
          rescheduled,
          stale,
          this.entries.size,
        );
      }
    } catch (error: unknown) {
      console.error('[NotificationScheduler] Reconciliation failed:', error);
    }
  }

  // ── Internal ─────────────────────────────────────────────────────

  private async cancelLocal(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) return;

    try {
      await notificationService.cancelNotification([entry.notificationId]);
    } catch {
      // best effort
    }

    this.entries.delete(key);
  }
}

export const notificationScheduler = new NotificationScheduler();
