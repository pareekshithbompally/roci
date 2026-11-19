/** One calendar occurrence (event id + start) ↔ the Roci meeting recorded from it. */

import { describe, it, expect } from 'vitest';
import { occurrenceKey, findMeetingForOccurrence } from '@services/calendar/occurrence';
import type { HistoryItem } from '@shared/types';

const meeting = (id: string, fields: Partial<HistoryItem>): HistoryItem => ({
  id,
  title: id,
  timestamp: 0,
  categories: [],
  transcript: '',
  summary: '',
  ...fields,
});

describe('occurrenceKey', () => {
  it("occurrence key matches Rust's id@start_ms", () => {
    expect(occurrenceKey('E1', '2026-11-19T10:00:00Z')).toBe('E1@1795082400000');
  });

  it('same instant in different ISO offsets gives the same key', () => {
    expect(occurrenceKey('E1', '2026-11-19T15:30:00+05:30')).toBe(occurrenceKey('E1', '2026-11-19T10:00:00Z'));
  });
});

describe('findMeetingForOccurrence', () => {
  const weekly = [
    meeting('m1', { calendarEventId: 'R', scheduledStart: '2026-11-12T09:00:00Z' }),
    meeting('m2', { calendarEventId: 'R', scheduledStart: '2026-11-19T09:00:00Z' }),
  ];

  it('links each occurrence of a recurring event to its own meeting', () => {
    expect(findMeetingForOccurrence(weekly, { event_id: 'R', start_date: '2026-11-19T09:00:00Z' })?.id).toBe('m2');
    expect(findMeetingForOccurrence(weekly, { event_id: 'R', start_date: '2026-11-12T09:00:00Z' })?.id).toBe('m1');
  });

  it('no meeting for an unrecorded occurrence', () => {
    expect(findMeetingForOccurrence(weekly, { event_id: 'R', start_date: '2026-11-26T09:00:00Z' })).toBeNull();
  });

  it('meetings without calendarEventId never match', () => {
    const plain = [meeting('p', { scheduledStart: '2026-11-19T09:00:00Z' })];
    expect(findMeetingForOccurrence(plain, { event_id: 'R', start_date: '2026-11-19T09:00:00Z' })).toBeNull();
  });

  it('several matches → the newest', () => {
    const twice = [
      meeting('old', { calendarEventId: 'R', scheduledStart: '2026-11-19T09:00:00Z', timestamp: 1 }),
      meeting('new', { calendarEventId: 'R', scheduledStart: '2026-11-19T09:00:00Z', timestamp: 2 }),
    ];
    expect(findMeetingForOccurrence(twice, { event_id: 'R', start_date: '2026-11-19T09:00:00Z' })?.id).toBe('new');
  });
});
