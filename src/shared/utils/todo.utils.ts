/**
 * Todo Utilities Module
 *
 * Single source of truth for all todo date/time logic:
 * normalization, overdue detection, formatting, and hashing.
 *
 * Every part of the app that deals with todo dates MUST use these functions.
 *
 * KEY DESIGN DECISION — Local-timezone parsing:
 * `new Date("YYYY-MM-DD")` treats date-only strings as UTC midnight per the JS spec.
 * That causes "today" dates to appear overdue by early afternoon in UTC- timezones.
 * All parsing goes through `parseDateLoose()`, which detects date-only strings and
 * constructs them as LOCAL midnight. This is the single fix for the whole system.
 */

import type { TodoReminder } from '@shared/types';

// ── Date parsing (single entry point) ───────────────────────────

/** Matches YYYY-MM-DD with no time component */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse any date string into a valid Date, or null if unparseable.
 *
 * Date-only strings ("2026-04-15") are treated as LOCAL midnight,
 * not UTC midnight — fixing the JS `new Date("YYYY-MM-DD")` footgun.
 * Strings with a time component ("2026-04-15T09:00:00") parse normally.
 */
export function parseDateLoose(input: string): Date | null {
  if (!input) return null;

  // Date-only → local midnight (not UTC midnight)
  const m = DATE_ONLY_RE.exec(input);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Build a local Date from a YYYY-MM-DD string + optional HH:MM time.
 * Used by form inputs and ReminderPicker — always local timezone.
 */
export function localDateFromParts(dateStr: string, timeStr?: string): Date | null {
  const m = DATE_ONLY_RE.exec(dateStr);
  if (!m) {
    // Try as full ISO / loose string
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    if (timeStr) {
      const [h, min] = timeStr.split(':').map(Number);
      d.setHours(h, min, 0, 0);
    }
    return d;
  }

  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (isNaN(d.getTime())) return null;

  if (timeStr) {
    const [h, min] = timeStr.split(':').map(Number);
    d.setHours(h, min, 0, 0);
  }
  return d;
}

// ── Date normalization ──────────────────────────────────────────

/**
 * Normalize a date string to ISO 8601 format.
 * If the input is already ISO 8601, returns it as-is.
 * If the input is a loose format (e.g. "Mar 28, 2026"), parses and converts.
 * Returns the original string if unparseable (graceful degradation).
 */
export function normalizeDueDate(input: string): string {
  if (!input) return input;
  // Already ISO 8601 (date-only or with time component) — return as-is
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(input)) return input;
  const d = parseDateLoose(input);
  return d ? d.toISOString() : input;
}

// ── Overdue detection ───────────────────────────────────────────

/**
 * Check if a due date is in the past (i.e. the todo is overdue).
 * Date-only strings compare against local midnight (via parseDateLoose).
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

// ── Formatting ──────────────────────────────────────────────────

/**
 * Format a due date for display: "Mar 28, 2026"
 */
export function formatDueDate(dueDate: string): string {
  const d = parseDateLoose(dueDate);
  if (!d) return dueDate;
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
 * Constructs in LOCAL timezone (via localDateFromParts), then converts to ISO.
 * @param dateStr - YYYY-MM-DD from <input type="date">
 * @param timeStr - HH:MM from <input type="time"> (optional, defaults to end of day)
 */
export function buildISOFromDateInput(dateStr: string, timeStr?: string): string {
  const d = localDateFromParts(dateStr, timeStr || '23:59');
  if (!d) return dateStr;
  return d.toISOString();
}
