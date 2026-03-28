/**
 * Todo Utilities Module
 *
 * Single source of truth for all todo date/time logic:
 * normalization, overdue detection, formatting, and hashing.
 *
 * Every part of the app that deals with todo dates MUST use these functions.
 */

import type { TodoReminder } from '@/types';

// ── Date normalization ──────────────────────────────────────────

/**
 * Parse any date string into a valid Date, or null if unparseable.
 * Handles ISO 8601, locale strings like "Mar 28, 2026 9:00 AM", etc.
 */
export function parseDateLoose(input: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Normalize a date string to ISO 8601 format.
 * If the input is already ISO 8601, returns it as-is.
 * If the input is a loose format (e.g. "Mar 28, 2026"), parses and converts.
 * Returns the original string if unparseable (graceful degradation).
 */
export function normalizeDueDate(input: string): string {
  if (!input) return input;
  // Already ISO 8601 — quick check
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(input)) return input;
  const d = parseDateLoose(input);
  return d ? d.toISOString() : input;
}

// ── Overdue detection ───────────────────────────────────────────

/**
 * Check if a due date is in the past (i.e. the todo is overdue).
 */
export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const d = parseDateLoose(dueDate);
  return d !== null && d.getTime() < Date.now();
}

/**
 * Check if a reminder's scheduled time has passed without being fired.
 */
export function isReminderOverdue(reminder?: TodoReminder): boolean {
  if (!reminder?.dateTime) return false;
  const d = parseDateLoose(reminder.dateTime);
  return d !== null && d.getTime() < Date.now();
}

// ── Status helpers ──────────────────────────────────────────────

export type DueStatus = 'overdue' | 'due-today' | 'upcoming' | 'none';

/**
 * Get the due status of a todo for UI display.
 */
export function getDueStatus(todo: { dueDate?: string; completed: boolean }): DueStatus {
  if (todo.completed || !todo.dueDate) return 'none';
  const d = parseDateLoose(todo.dueDate);
  if (!d) return 'none';

  const now = new Date();
  if (d.getTime() < now.getTime()) return 'overdue';

  // Due today: same calendar day
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return 'due-today';
  }

  return 'upcoming';
}

// ── Formatting ──────────────────────────────────────────────────

/**
 * Format a due date for display: "Mar 28, 2026"
 */
export function formatDueDate(dueDate: string): string {
  const d = parseDateLoose(dueDate);
  if (!d) return dueDate; // Return as-is if unparseable
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a reminder datetime for display: "Mar 28 at 9:00 AM"
 */
export function formatReminderDate(dateTime: string): string {
  const d = parseDateLoose(dateTime);
  if (!d) return dateTime;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Notification ID ─────────────────────────────────────────────

/**
 * Deterministic 32-bit integer from a UUID string.
 * Required by Tauri notification API — must be non-zero.
 */
export function hashToNotificationId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// ── ISO date builders (for create forms) ────────────────────────

/**
 * Build an ISO 8601 string from a date input value and optional time.
 * @param dateStr - YYYY-MM-DD from <input type="date">
 * @param timeStr - HH:MM from <input type="time"> (optional, defaults to end of day)
 */
export function buildISOFromDateInput(dateStr: string, timeStr?: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  if (timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    d.setHours(hours, minutes, 0, 0);
  } else {
    d.setHours(23, 59, 59, 0);
  }
  return d.toISOString();
}
