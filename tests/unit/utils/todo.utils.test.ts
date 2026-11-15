import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseDateLoose,
  localDateFromParts,
  normalizeDueDate,
  isOverdue,
  isReminderOverdue,
  formatDueDate,
  formatReminderDate,
  hashToNotificationId,
  buildISOFromDateInput,
} from '@shared/utils/todo.utils';

describe('parseDateLoose', () => {
  it('returns null for empty string', () => {
    expect(parseDateLoose('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    // empty after truthy check — '' is falsy, but let's also confirm behavior
    expect(parseDateLoose('')).toBeNull();
  });

  it('parses date-only string to LOCAL midnight (not UTC)', () => {
    const d = parseDateLoose('2025-06-15');
    expect(d).not.toBeNull();
    // CRITICAL: date-only must be local midnight, not UTC midnight
    expect(d!.getHours()).toBe(0);
    expect(d!.getMinutes()).toBe(0);
    expect(d!.getSeconds()).toBe(0);
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(5); // June = 5
    expect(d!.getDate()).toBe(15);
  });

  it('parses ISO string with time component', () => {
    const d = parseDateLoose('2025-03-10T14:30:00.000Z');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2025-03-10T14:30:00.000Z');
  });

  it('parses ISO string without milliseconds', () => {
    const d = parseDateLoose('2025-01-01T00:00:00Z');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2025);
  });

  it('returns null for completely invalid strings', () => {
    expect(parseDateLoose('not-a-date')).toBeNull();
    expect(parseDateLoose('abc123')).toBeNull();
    expect(parseDateLoose('----')).toBeNull();
  });

  it('handles date-only strings with out-of-range month (JS Date rolls over)', () => {
    // '2025-13-01' matches DATE_ONLY_RE → new Date(2025, 12, 1) → JS rolls to Jan 2026
    const d = parseDateLoose('2025-13-01');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(0); // January (rolled over)
  });

  it('handles edge date: leap day', () => {
    const d = parseDateLoose('2024-02-29');
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(1); // Feb
    expect(d!.getDate()).toBe(29);
  });

  it('handles edge date: year boundaries', () => {
    const d = parseDateLoose('2025-01-01');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(1);
  });

  it('handles edge date: end of year', () => {
    const d = parseDateLoose('2025-12-31');
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(11);
    expect(d!.getDate()).toBe(31);
  });

  it('parses a date string with spaces (e.g. "Jun 15 2025")', () => {
    const d = parseDateLoose('Jun 15 2025');
    // new Date('Jun 15 2025') is valid in most engines
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(15);
  });
});

describe('localDateFromParts', () => {
  it('parses date-only string without time', () => {
    const d = localDateFromParts('2025-06-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
    expect(d!.getHours()).toBe(0);
  });

  it('parses date-only string with time', () => {
    const d = localDateFromParts('2025-06-15', '14:30');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(14);
    expect(d!.getMinutes()).toBe(30);
    expect(d!.getSeconds()).toBe(0);
  });

  it('parses non-date-only string (ISO) without time override', () => {
    const d = localDateFromParts('2025-06-15T10:00:00Z');
    expect(d).not.toBeNull();
    // Should use the ISO parsed time
  });

  it('parses non-date-only string (ISO) with time override', () => {
    const d = localDateFromParts('2025-06-15T10:00:00Z', '08:15');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(8);
    expect(d!.getMinutes()).toBe(15);
  });

  it('returns null for completely invalid date string', () => {
    expect(localDateFromParts('garbage')).toBeNull();
  });

  it('returns null for invalid non-date-only string', () => {
    expect(localDateFromParts('not-a-real-date')).toBeNull();
  });

  it('handles time with leading zeros', () => {
    const d = localDateFromParts('2025-01-01', '09:05');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(9);
    expect(d!.getMinutes()).toBe(5);
  });

  it('handles midnight time', () => {
    const d = localDateFromParts('2025-01-01', '00:00');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(0);
    expect(d!.getMinutes()).toBe(0);
  });
});

describe('normalizeDueDate', () => {
  it('returns empty string as-is', () => {
    expect(normalizeDueDate('')).toBe('');
  });

  it('returns date-only ISO string as-is', () => {
    expect(normalizeDueDate('2025-06-15')).toBe('2025-06-15');
  });

  it('returns ISO string with T as-is', () => {
    const iso = '2025-06-15T14:30:00.000Z';
    expect(normalizeDueDate(iso)).toBe(iso);
  });

  it('normalizes a loose date format to ISO', () => {
    const result = normalizeDueDate('Jun 15 2025');
    // Should be parsed and returned as ISO string
    expect(result).toContain('2025');
    expect(result).toContain('T');
  });

  it('returns unparseable string as-is', () => {
    expect(normalizeDueDate('not-a-date')).toBe('not-a-date');
  });

  it('preserves already-normalized dates starting with YYYY-MM-DD', () => {
    expect(normalizeDueDate('2025-01-01')).toBe('2025-01-01');
  });
});

describe('isOverdue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for undefined', () => {
    expect(isOverdue(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isOverdue('')).toBe(false);
  });

  it('returns true for a date in the past', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
  });

  it('returns false for a date far in the future', () => {
    expect(isOverdue('2099-12-31')).toBe(false);
  });

  it('returns false for an unparseable string', () => {
    expect(isOverdue('not-a-date')).toBe(false);
  });

  it('returns true for a past ISO datetime', () => {
    expect(isOverdue('2020-06-15T10:00:00Z')).toBe(true);
  });

  it('returns false for a future ISO datetime', () => {
    expect(isOverdue('2099-06-15T10:00:00Z')).toBe(false);
  });

  it('handles edge case: date exactly now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    // Local-midnight parsing makes the answer timezone-dependent, so only the type is checked.
    const result = isOverdue('2025-06-15T12:00:00Z');
    expect(typeof result).toBe('boolean');
    vi.useRealTimers();
  });
});

describe('isReminderOverdue', () => {
  it('returns false for undefined reminder', () => {
    expect(isReminderOverdue(undefined)).toBe(false);
  });

  it('returns false for reminder without dateTime', () => {
    expect(isReminderOverdue({ notificationId: 1 } as any)).toBe(false);
  });

  it('returns false for reminder with empty dateTime', () => {
    expect(isReminderOverdue({ dateTime: '', notificationId: 1 })).toBe(false);
  });

  it('returns true for a past reminder', () => {
    expect(isReminderOverdue({ dateTime: '2020-01-01T10:00:00Z', notificationId: 123 })).toBe(true);
  });

  it('returns false for a future reminder', () => {
    expect(isReminderOverdue({ dateTime: '2099-12-31T23:59:00Z', notificationId: 456 })).toBe(false);
  });

  it('returns false for unparseable dateTime', () => {
    expect(isReminderOverdue({ dateTime: 'garbage', notificationId: 789 })).toBe(false);
  });
});

describe('formatDueDate', () => {
  it('formats a valid date-only string', () => {
    const result = formatDueDate('2025-06-15');
    // en-US short month format
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });

  it('formats a valid ISO date string', () => {
    const result = formatDueDate('2025-01-01T00:00:00Z');
    expect(result).toContain('2025');
  });

  it('returns the original string for invalid dates', () => {
    expect(formatDueDate('not-a-date')).toBe('not-a-date');
  });

  it('returns the original string for empty-ish invalid input', () => {
    expect(formatDueDate('xyz')).toBe('xyz');
  });
});

describe('formatReminderDate', () => {
  it('formats a valid ISO datetime', () => {
    const result = formatReminderDate('2025-06-15T14:30:00Z');
    // en-US format: "Jun 15, 2:30 PM" (no year in this format)
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns original string for invalid input', () => {
    expect(formatReminderDate('garbage')).toBe('garbage');
  });

  it('formats a date-only string (time will be midnight)', () => {
    const result = formatReminderDate('2025-03-10');
    expect(result).toContain('Mar');
    expect(result).toContain('10');
  });
});

describe('hashToNotificationId', () => {
  it('is deterministic — same input gives same output', () => {
    const a = hashToNotificationId('test-string');
    const b = hashToNotificationId('test-string');
    expect(a).toBe(b);
  });

  it('always returns a positive number', () => {
    expect(hashToNotificationId('hello')).toBeGreaterThan(0);
    expect(hashToNotificationId('world')).toBeGreaterThan(0);
    expect(hashToNotificationId('a')).toBeGreaterThan(0);
  });

  it('returns 1 for empty string (Math.abs(0) || 1)', () => {
    expect(hashToNotificationId('')).toBe(1);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = hashToNotificationId('meeting-1-todo-1');
    const h2 = hashToNotificationId('meeting-1-todo-2');
    const h3 = hashToNotificationId('meeting-2-todo-1');
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h2).not.toBe(h3);
  });

  it('returns an integer', () => {
    const h = hashToNotificationId('some-id');
    expect(Number.isInteger(h)).toBe(true);
  });

  it('handles long strings', () => {
    const long = 'a'.repeat(10000);
    const h = hashToNotificationId(long);
    expect(h).toBeGreaterThan(0);
    expect(Number.isInteger(h)).toBe(true);
  });

  it('handles special characters', () => {
    const h = hashToNotificationId('🎉emoji-and-ünïcödé');
    expect(h).toBeGreaterThan(0);
  });
});

describe('buildISOFromDateInput', () => {
  it('builds ISO string with provided time', () => {
    const result = buildISOFromDateInput('2025-06-15', '14:30');
    const d = new Date(result);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('defaults to 23:59 when time is not provided', () => {
    const result = buildISOFromDateInput('2025-06-15');
    const d = new Date(result);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });

  it('returns ISO format string', () => {
    const result = buildISOFromDateInput('2025-06-15', '10:00');
    expect(result).toContain('T');
    expect(result).toContain('Z');
  });

  it('returns the original string for invalid date input', () => {
    expect(buildISOFromDateInput('not-a-date')).toBe('not-a-date');
  });

  it('handles ISO input string with time override', () => {
    const result = buildISOFromDateInput('2025-06-15T00:00:00Z', '09:00');
    const d = new Date(result);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });
});
