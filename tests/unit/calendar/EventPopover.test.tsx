/** The event popover's links: Open meeting for a recorded occurrence, Record / Join & Record while it is recordable (Mac). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { CalendarEvent } from '@services/calendar';
import type { HistoryItem } from '@shared/types';

const mocks = vi.hoisted(() => ({
  openMeeting: vi.fn(async () => undefined),
  recordCalendarEvent: vi.fn(async () => undefined),
  platform: { canRecordFromCalendar: true },
}));

vi.mock('@features/history', () => ({ useOpenMeeting: () => mocks.openMeeting }));
vi.mock('@features/recording', () => ({ useRecordingMeetingId: () => null }));
vi.mock('@shared/contexts/SettingsContext', () => ({ useSettings: () => ({ settings: { notifications: { meetingLeadMinutes: 5 } } }) }));
vi.mock('@platform/index', () => ({ platform: mocks.platform }));
vi.mock('@services/calendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/calendar')>()),
  recordCalendarEvent: mocks.recordCalendarEvent,
}));
vi.mock('@shared/contexts/HistoryContext', async () => {
  const { queryKeys } = await import('@shared/query/queryKeys');
  return { meetingsQuery: { queryKey: queryKeys.meetings(), queryFn: async () => [] } };
});

// eslint-disable-next-line import/first
import { EventPopover } from '@features/calendar/components/EventPopover';
// eslint-disable-next-line import/first
import { queryKeys } from '@shared/query/queryKeys';

const START = '2026-11-19T10:00:00.000Z';
const END = '2026-11-19T11:00:00.000Z';
const event = (meeting_url: string | null = 'https://zoom.us/j/1'): CalendarEvent => ({
  event_id: 'E', title: 'Client review', start_date: START, end_date: END, attendees: [], calendar_name: 'Work',
  is_all_day: false, start_ms: Date.parse(START), end_ms: Date.parse(END), is_cancelled: false, is_free: false,
  meeting_url, meeting_provider: meeting_url ? 'Zoom' : null,
});
const recorded: HistoryItem = {
  id: 'm1', title: 'Client review', timestamp: 1, categories: [], transcript: '', summary: '',
  calendarEventId: 'E', scheduledStart: START,
};

function show(ev: CalendarEvent, meetings: HistoryItem[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.meetings(), meetings);
  render(
    <QueryClientProvider client={client}>
      <EventPopover event={ev} anchorRect={new DOMRect(0, 0, 10, 10)} onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(START));
  mocks.platform.canRecordFromCalendar = true;
  mocks.openMeeting.mockClear();
  mocks.recordCalendarEvent.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('EventPopover', () => {
  it('shows Open meeting for a recorded occurrence and opens it', () => {
    show(event(), [recorded]);
    fireEvent.click(screen.getByRole('button', { name: 'Open meeting' }));
    expect(mocks.openMeeting).toHaveBeenCalledWith(recorded);
    expect(screen.queryByRole('button', { name: /Record/ })).toBeNull();
  });

  it('shows Join & Record for an upcoming event with a call link and calls recordCalendarEvent(event, true)', () => {
    const ev = event();
    show(ev);
    fireEvent.click(screen.getByRole('button', { name: 'Join & Record' }));
    expect(mocks.recordCalendarEvent).toHaveBeenCalledWith(ev, true);
  });

  it('shows Record without a call link', () => {
    show(event(null));
    expect(screen.getByRole('button', { name: 'Record' })).toBeTruthy();
  });

  it('no record action for a past event', () => {
    vi.setSystemTime(new Date(END));
    show(event());
    expect(screen.queryByRole('button', { name: /Record/ })).toBeNull();
  });

  it('no record action when canRecordFromCalendar is false', () => {
    mocks.platform.canRecordFromCalendar = false;
    show(event());
    expect(screen.queryByRole('button', { name: /Record/ })).toBeNull();
  });
});
