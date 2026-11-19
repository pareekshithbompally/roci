/** When an event offers Record / Join & Record: from the reminder lead time before it starts until it ends. */

import { describe, it, expect } from 'vitest';
import { recordAction } from '@features/calendar/utils/recordWindow';
import type { CalendarEvent } from '@services/calendar';

const START = Date.parse('2026-11-19T10:00:00Z');
const END = Date.parse('2026-11-19T11:00:00Z');
const LEAD = 5;
const LEAD_MS = LEAD * 60_000;
const idle = { recording: false, hasMeeting: false };

const event = (meeting_url: string | null): CalendarEvent => ({
  event_id: 'E', title: 'Sync', start_date: new Date(START).toISOString(), end_date: new Date(END).toISOString(),
  attendees: [], calendar_name: 'Work', is_all_day: false, start_ms: START, end_ms: END, is_cancelled: false,
  is_free: false, meeting_url, meeting_provider: meeting_url ? 'Zoom' : null,
});

describe('recordAction', () => {
  it('join when it has a call link', () => {
    expect(recordAction(event('https://zoom.us/j/1'), START, LEAD, idle)).toBe('join');
  });

  it('record without a link', () => {
    expect(recordAction(event(null), START, LEAD, idle)).toBe('record');
  });

  it('hidden before lead time and after end', () => {
    expect(recordAction(event(null), START - LEAD_MS - 1, LEAD, idle)).toBeNull();
    expect(recordAction(event(null), START - LEAD_MS, LEAD, idle)).toBe('record');
    expect(recordAction(event(null), END, LEAD, idle)).toBeNull();
  });

  it('hidden while recording', () => {
    expect(recordAction(event(null), START, LEAD, { recording: true, hasMeeting: false })).toBeNull();
  });

  it('hidden once the occurrence has a meeting', () => {
    expect(recordAction(event(null), START, LEAD, { recording: false, hasMeeting: true })).toBeNull();
  });
});
