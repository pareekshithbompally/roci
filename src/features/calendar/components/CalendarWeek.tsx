/** Read-only Schedule-X week view; the parent drives navigation and renders the event popover. */

// Schedule-X requires Temporal as a global — polyfill must load before any Schedule-X import
import 'temporal-polyfill/global';

import React, { useState, useEffect } from 'react';
import { useCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import { createViewWeek } from '@schedule-x/calendar';
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls';
import '@schedule-x/theme-default/dist/index.css';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import type { CalendarEvent as ScheduleXCalendarEvent } from '@schedule-x/calendar';

export interface CalendarControls {
  goToToday: () => void;
  goForward: () => void;
  goBack: () => void;
  goToDate: (isoDate: string) => void;
  getDate: () => string;
  getRange: () => { start: string; end: string } | null;
}

interface CalendarWeekProps {
  events: ScheduleXCalendarEvent[];
  onControlsReady?: (controls: CalendarControls) => void;
  onEventClick?: (event: ScheduleXCalendarEvent, domRect: DOMRect | null) => void;
  onRangeUpdate?: (range: { start: string; end: string }) => void;
}

export const CalendarWeek: React.FC<CalendarWeekProps> = ({
  events,
  onControlsReady,
  onEventClick,
  onRangeUpdate,
}) => {
  const { isDark } = useThemeContext();
  const [controlsPlugin] = useState(() => createCalendarControlsPlugin());

  const calendar = useCalendarApp({
    views: [createViewWeek()],
    events,
    isDark,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dayBoundaries: {
      start: CALENDAR_CONFIG.weekView.dayStartHour,
      end: CALENDAR_CONFIG.weekView.dayEndHour,
    },
    weekOptions: {
      gridHeight: 900,
      eventWidth: 95,
      timeAxisFormatOptions: { hour: '2-digit', minute: '2-digit', hour12: false },
    },
    callbacks: {
      onEventClick(event: ScheduleXCalendarEvent, e: UIEvent) {
        if (!onEventClick) return;
        const target = e.target as HTMLElement;
        const eventEl = target.closest('.sx__time-grid-event') as HTMLElement | null;
        onEventClick(event, eventEl?.getBoundingClientRect() ?? null);
      },
      onRangeUpdate(range: { start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime }) {
        onRangeUpdate?.({
          start: range.start.toInstant().toString(),
          end: range.end.toInstant().toString(),
        });
      },
    },
  }, [controlsPlugin]);

  // Keep Schedule-X event store in sync when events prop changes
  useEffect(() => {
    if (!calendar) return;
    const store = calendar.events;
    if (!store) return;
    store.set(events);
  }, [calendar, events]);

  useEffect(() => {
    if (!onControlsReady) return;
    onControlsReady({
      goToToday: () => controlsPlugin.setDate(Temporal.PlainDate.from(
        new Date().toISOString().slice(0, 10)
      )),
      goForward: () => {
        const current = controlsPlugin.getDate();
        const next = Temporal.PlainDate.from(current).add({ weeks: 1 });
        controlsPlugin.setDate(next);
      },
      goBack: () => {
        const current = controlsPlugin.getDate();
        const prev = Temporal.PlainDate.from(current).subtract({ weeks: 1 });
        controlsPlugin.setDate(prev);
      },
      goToDate: (isoDate: string) => {
        controlsPlugin.setDate(Temporal.PlainDate.from(isoDate));
      },
      getDate: () => controlsPlugin.getDate().toString(),
      getRange: () => {
        const range = controlsPlugin.getRange();
        if (!range) return null;
        return {
          start: range.start.toInstant().toString(),
          end: range.end.toInstant().toString(),
        };
      },
    });
  }, [controlsPlugin, onControlsReady]);

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  );
};
