/** All todo date logic; date-only strings parse as LOCAL midnight (not UTC) so today never shows overdue. */

import type { TodoReminder } from '@shared/types';
import { addDays } from '@shared/utils/localDate';
import { formatDate, formatShortDateTime } from '@shared/utils/formatters';

// ── Date parsing (single entry point) ───────────────────────────

/** Matches YYYY-MM-DD with no time component */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a date string or null; date-only "YYYY-MM-DD" is local midnight, not UTC. */
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

/** Local Date from YYYY-MM-DD plus optional HH:MM (form inputs, ReminderPicker). */
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

/** Normalize to ISO 8601; loose formats ("Mar 28, 2026") are converted, unparseable input returned unchanged. */
export function normalizeDueDate(input: string): string {
  if (!input) return input;
  // Already ISO 8601 (date-only or with time component) — return as-is
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(input)) return input;
  const d = parseDateLoose(input);
  return d ? d.toISOString() : input;
}

// ── Overdue detection ───────────────────────────────────────────

/** Whether a due date has passed; a date without a time is due until that local day ends. */
export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const d = parseDateLoose(dueDate);
  if (!d) return false;
  return (DATE_ONLY_RE.test(dueDate) ? addDays(d, 1) : d).getTime() <= Date.now();
}

/** Whether a reminder's scheduled time passed without it firing. */
export function isReminderOverdue(reminder?: TodoReminder): boolean {
  if (!reminder?.dateTime) return false;
  const d = parseDateLoose(reminder.dateTime);
  return d !== null && d.getTime() < Date.now();
}

// ── Formatting ──────────────────────────────────────────────────

/** Due date for display: "28 Mar 2026" in the device's format. */
export function formatDueDate(dueDate: string): string {
  const d = parseDateLoose(dueDate);
  if (!d) return dueDate;
  return formatDate(d);
}

/** Reminder datetime for display: "28 Mar, 09:00" in the device's format. */
export function formatReminderDate(dateTime: string): string {
  const d = parseDateLoose(dateTime);
  if (!d) return dateTime;
  return formatShortDateTime(d);
}

// ── Notification ID ─────────────────────────────────────────────

/** Deterministic non-zero 32-bit id from a UUID, as the Tauri notification API requires. */
export function hashToNotificationId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// ── ISO date builders (for create forms) ────────────────────────

/** ISO string from date/time input values, built in local time; time defaults to end of day. */
export function buildISOFromDateInput(dateStr: string, timeStr?: string): string {
  const d = localDateFromParts(dateStr, timeStr || '23:59');
  if (!d) return dateStr;
  return d.toISOString();
}

/** A meeting's date in to-do lists and pickers: "Nov 18, 2026". */
export const formatMeetingDate = (ts: number): string => formatDate(ts);
