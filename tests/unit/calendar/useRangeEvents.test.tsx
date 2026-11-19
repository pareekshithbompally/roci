/** The events of the range on screen, read through Query and refreshed for every cached range on a calendar change. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { CalendarEvent } from '@services/calendar';

const { getEventsInRange } = vi.hoisted(() => ({ getEventsInRange: vi.fn<(start: string, end: string) => Promise<CalendarEvent[]>>() }));
vi.mock('@services/calendar', () => ({ calendarService: { getEventsInRange } }));

// eslint-disable-next-line import/first
import { useRangeEvents } from '@features/calendar/hooks/useRangeEvents';
// eslint-disable-next-line import/first
import { queryKeys } from '@shared/query/queryKeys';

const event = (id: string, fields: Partial<CalendarEvent> = {}): CalendarEvent => ({
  event_id: id, title: id, start_date: '2026-11-19T09:00:00Z', end_date: '2026-11-19T10:00:00Z', attendees: [],
  calendar_name: 'Work', is_all_day: false, start_ms: 0, end_ms: 0, is_cancelled: false, is_free: false,
  meeting_url: null, meeting_provider: null, ...fields,
});

const week1 = { start: new Date('2026-11-16T00:00:00Z'), end: new Date('2026-11-23T00:00:00Z') };
const week2 = { start: new Date('2026-11-23T00:00:00Z'), end: new Date('2026-11-30T00:00:00Z') };

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getEventsInRange.mockReset();
  getEventsInRange.mockResolvedValue([event('a'), event('allday', { is_all_day: true }), event('gone', { is_cancelled: true })]);
});

describe('useRangeEvents', () => {
  it('fetches the visible range', async () => {
    renderHook(() => useRangeEvents(week1, true), { wrapper });
    await waitFor(() => expect(getEventsInRange).toHaveBeenCalledWith(week1.start.toISOString(), week1.end.toISOString()));
  });

  it('splits all-day events from timed ones and drops cancelled', async () => {
    const { result } = renderHook(() => useRangeEvents(week1, true), { wrapper });
    await waitFor(() => expect(result.current.events.map((e) => e.event_id)).toEqual(['a']));
    expect(result.current.allDay.map((e) => e.event_id)).toEqual(['allday']);
  });

  it('disabled → no fetch', async () => {
    renderHook(() => useRangeEvents(week1, false), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(getEventsInRange).not.toHaveBeenCalled();
  });

  it('calendar change invalidates every cached week', async () => {
    renderHook(() => useRangeEvents(week1, true), { wrapper });
    renderHook(() => useRangeEvents(week2, true), { wrapper });
    await waitFor(() => expect(getEventsInRange).toHaveBeenCalledTimes(2));
    await client.invalidateQueries({ queryKey: queryKeys.calendarEventsAll() });
    await waitFor(() => expect(getEventsInRange).toHaveBeenCalledTimes(4));
  });
});
