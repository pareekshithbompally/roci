import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatFileSize,
  formatDuration,
  truncate,
} from '@shared/utils/formatters';

describe('formatDate', () => {
  it('formats a Date object', () => {
    const result = formatDate(new Date(2025, 5, 15)); // June 15, 2025
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });

  it('formats a date string', () => {
    const result = formatDate('2025-01-01T00:00:00Z');
    expect(result).toContain('2025');
  });

  it('formats a timestamp number', () => {
    const result = formatDate(0); // epoch
    expect(result).toContain('1970');
  });

  it('returns a non-empty string for valid input', () => {
    expect(formatDate(new Date()).length).toBeGreaterThan(0);
  });
});

describe('formatDateTime', () => {
  it('formats a Date object with time', () => {
    const result = formatDateTime(new Date(2025, 5, 15, 14, 30));
    expect(result).toContain('2025');
    expect(result).toContain('15');
    // Should contain time portion
    expect(result).toContain(':');
  });

  it('formats a date string with time', () => {
    const result = formatDateTime('2025-06-15T14:30:00Z');
    expect(result).toContain('2025');
  });

  it('formats a timestamp number', () => {
    const result = formatDateTime(1000000000000);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for times less than 60 seconds ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:30Z'));
    expect(formatRelativeTime(new Date('2025-06-15T12:00:00Z'))).toBe('just now');
    vi.useRealTimers();
  });

  it('returns "1 minute ago" for singular', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:01:30Z'));
    expect(formatRelativeTime(new Date('2025-06-15T12:00:00Z'))).toBe('1 minute ago');
    vi.useRealTimers();
  });

  it('returns "X minutes ago" for plural', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:05:00Z'));
    expect(formatRelativeTime(new Date('2025-06-15T12:00:00Z'))).toBe('5 minutes ago');
    vi.useRealTimers();
  });

  it('returns "1 hour ago" for singular', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T13:00:00Z'));
    expect(formatRelativeTime(new Date('2025-06-15T12:00:00Z'))).toBe('1 hour ago');
    vi.useRealTimers();
  });

  it('returns "X hours ago" for plural', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T15:00:00Z'));
    expect(formatRelativeTime(new Date('2025-06-15T12:00:00Z'))).toBe('3 hours ago');
    vi.useRealTimers();
  });

  it('returns "1 day ago" for singular', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-16T12:00:00Z'));
    expect(formatRelativeTime(new Date('2025-06-15T12:00:00Z'))).toBe('1 day ago');
    vi.useRealTimers();
  });

  it('returns "X days ago" for plural', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-18T12:00:00Z'));
    expect(formatRelativeTime(new Date('2025-06-15T12:00:00Z'))).toBe('3 days ago');
    vi.useRealTimers();
  });

  it('falls back to formatDate for 7+ days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-25T12:00:00Z'));
    const result = formatRelativeTime(new Date('2025-06-15T12:00:00Z'));
    // Should fall back to formatted date, not "X days ago"
    expect(result).not.toContain('days ago');
    expect(result).toContain('2025');
    vi.useRealTimers();
  });
});

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats bytes (< 1KB)', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
  });

  it('formats with decimal precision', () => {
    // 1.5 MB = 1572864
    const result = formatFileSize(1572864);
    expect(result).toBe('1.5 MB');
  });

  it('handles 1 byte', () => {
    expect(formatFileSize(1)).toBe('1 Bytes');
  });
});

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1:00');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('formats exactly one hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });

  it('pads seconds with leading zero', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('pads minutes and seconds in hour format', () => {
    expect(formatDuration(3601)).toBe('1:00:01');
  });

  it('handles large durations', () => {
    expect(formatDuration(36000)).toBe('10:00:00');
  });
});

describe('truncate', () => {
  it('returns text unchanged when within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns text unchanged when exactly at limit', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates with ellipsis when over limit', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles very short maxLength', () => {
    expect(truncate('hello', 4)).toBe('h...');
  });

  it('handles maxLength of 3 (edge: all ellipsis)', () => {
    expect(truncate('hello', 3)).toBe('...');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });
});
