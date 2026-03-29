/**
 * CalendarView Component
 *
 * Full-screen week view of upcoming calendar events.
 * Layout: [← Back | 📅 Schedule] ———— [◀ ▶ | range | 📅 picker | Today | Sync]
 * Event clicks open a custom popover with details.
 */

import React, { useCallback, useState, useRef } from 'react';
import { ArrowLeft, CalendarDays, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '@shared/contexts/AppContext';
import { CalendarWeek } from './CalendarWeek';
import type { CalendarControls } from './CalendarWeek';
import { EventPopover } from './EventPopover';
import { DatePicker } from '@shared/ui/date-picker';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { AppStatus } from '@/types';
import type { CalendarEvent as ScheduleXCalendarEvent } from '@schedule-x/calendar';

// ─── Helpers ────────────────────────────────────────────────────────

/** Format a Schedule-X range into "Mar 24 – 30, 2026" */
function formatRangeLabel(range: { start: string; end: string } | null): string {
  if (!range) return '';
  try {
    const start = new Date(range.start);
    const end = new Date(range.end);
    if (isNaN(start.getTime())) return '';

    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

    if (sameMonth && sameYear) {
      return `${start.toLocaleDateString([], opts)} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    if (sameYear) {
      return `${start.toLocaleDateString([], opts)} – ${end.toLocaleDateString([], opts)}, ${end.getFullYear()}`;
    }
    return `${start.toLocaleDateString([], { ...opts, year: 'numeric' })} – ${end.toLocaleDateString([], { ...opts, year: 'numeric' })}`;
  } catch {
    return '';
  }
}

/** Extract YYYY-MM-DD from a Schedule-X range start for the date picker value */
function rangeToPickerDate(range: { start: string; end: string } | null): string {
  if (!range) return new Date().toISOString().slice(0, 10);
  try {
    return new Date(range.start).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ─── Shared button style for header nav arrows ─────────────────────
// Matches COMPONENT.settingsButtonOutline height (py-1.5 + border)
const NAV_BUTTON = `inline-flex items-center justify-center py-1.5 px-2 ${TEXT.primary} ${SURFACE.hoverSubtle} border ${BORDER.strong} rounded-md transition-colors`;

// ─── Component ──────────────────────────────────────────────────────

export const CalendarView: React.FC = () => {
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult } = useApp();
  const { scheduleXEvents, isEmpty, refresh } = useCalendarEvents();
  const [isSyncing, setIsSyncing] = useState(false);
  const [rangeLabel, setRangeLabel] = useState('');
  const [currentRange, setCurrentRange] = useState<{ start: string; end: string } | null>(null);
  const controlsRef = useRef<CalendarControls | null>(null);

  // Event popover state
  const [popoverEvent, setPopoverEvent] = useState<ScheduleXCalendarEvent | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);

  const handleBack = useCallback(() => {
    setCurrentView('home');
    setSelectedHistoryId(null);
    setResult(null);
    setStatus(AppStatus.IDLE);
  }, [setCurrentView, setSelectedHistoryId, setResult, setStatus]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  const handleControlsReady = useCallback((controls: CalendarControls) => {
    controlsRef.current = controls;
    const range = controls.getRange();
    if (range) {
      setRangeLabel(formatRangeLabel(range));
      setCurrentRange(range);
    }
  }, []);

  const handleRangeUpdate = useCallback((range: { start: string; end: string }) => {
    setRangeLabel(formatRangeLabel(range));
    setCurrentRange(range);
  }, []);

  const handleDatePick = useCallback((value: string) => {
    if (value) controlsRef.current?.goToDate(value);
  }, []);

  const handleEventClick = useCallback((event: ScheduleXCalendarEvent, rect: DOMRect | null) => {
    setPopoverEvent(event);
    setPopoverRect(rect);
  }, []);

  const handleClosePopover = useCallback(() => {
    setPopoverEvent(null);
    setPopoverRect(null);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in">
      {/* Header */}
      <div className={`shrink-0 border-b ${BORDER.default} px-5 py-2.5`}>
        <div className="flex items-center">
          {/* Left: back + title */}
          <button
            onClick={handleBack}
            className={`${COMPONENT.iconButtonSm} rounded-lg ${SURFACE.hoverSubtle} mr-2.5`}
            aria-label="Back to home"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <CalendarDays className={`w-4 h-4 ${TEXT.muted} mr-1`} />
          <h1 className={`text-[14px] font-semibold ${TEXT.heading}`}>Schedule</h1>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right: nav arrows, range, date picker, today, sync */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => controlsRef.current?.goBack()}
              className={NAV_BUTTON}
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => controlsRef.current?.goForward()}
              className={NAV_BUTTON}
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {rangeLabel && (
              <span className={`mx-1 text-[12.5px] font-medium ${TEXT.muted} tabular-nums whitespace-nowrap`}>
                {rangeLabel}
              </span>
            )}

            {/* Radix date picker — themed calendar popover */}
            <DatePicker
              value={rangeToPickerDate(currentRange)}
              onChange={handleDatePick}
              placeholder="Go to date"
            />

            <button
              onClick={() => controlsRef.current?.goToToday()}
              className={COMPONENT.settingsButtonOutline}
            >
              Today
            </button>

            <button
              onClick={handleSync}
              disabled={isSyncing}
              className={COMPONENT.settingsButtonOutline}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className={`p-4 rounded-2xl ${SURFACE.subtle} mb-4`}>
            <CalendarDays className={`w-8 h-8 ${TEXT.faint}`} />
          </div>
          <p className={`text-sm font-medium ${TEXT.secondary} mb-1`}>
            No upcoming events
          </p>
          <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} text-center max-w-xs`}>
            Events from your macOS Calendar will appear here when calendar integration is enabled.
          </p>
        </div>
      ) : (
        <CalendarWeek
          events={scheduleXEvents}
          onControlsReady={handleControlsReady}
          onEventClick={handleEventClick}
          onRangeUpdate={handleRangeUpdate}
        />
      )}

      {/* Event detail popover */}
      {popoverEvent && (
        <EventPopover
          event={popoverEvent}
          anchorRect={popoverRect}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
};
