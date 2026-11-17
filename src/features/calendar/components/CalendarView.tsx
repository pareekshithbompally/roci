/** Upcoming: the calendar's events, a week on a Mac and a day on iPhone, opened from the sidebar row; empty states for off, loading and none. */

import React, { useCallback, useState, useRef } from 'react';
import { CalendarDays, RefreshCw, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useAppActions } from '@shared/stores/appStore';
import { CalendarWeek, type CalendarSpan } from './CalendarWeek';
import type { CalendarControls } from './CalendarWeek';
import { EventPopover } from './EventPopover';
import { DatePicker, Button, Icon, IconButton, Surface, Text, TitlebarSpacer } from '@shared/ui';
import { EmptyState } from '@shared/components';
import { useCalendarEvents } from '@features/calendar/hooks/useCalendarEvents';
import { useFormFactor } from '@platform/formFactor';
import { LAYOUT } from '@config/layout.config';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import type { CalendarEvent as ScheduleXCalendarEvent } from '@schedule-x/calendar';

// ─── Helpers ────────────────────────────────────────────────────────

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

function rangeToPickerDate(range: { start: string; end: string } | null): string {
  if (!range) return new Date().toISOString().slice(0, 10);
  try {
    return new Date(range.start).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ─── Empty State ─────────────────────────────────────────────────────

const NOT_ENABLED = {
  message: 'Calendar integration is not enabled',
  description: 'Enable calendar integration in Settings to see your upcoming events.',
};
const LOADING = {
  message: 'Loading events…',
  description: 'Fetching your upcoming meetings from your calendar.',
};
const NO_EVENTS = {
  message: 'No upcoming events',
  description: 'You have no meetings scheduled in the next 7 days.',
};

const CalendarEmptyState: React.FC<{
  isEnabled: boolean;
  isInitialFetchDone: boolean;
  onGoToSettings: () => void;
}> = ({ isEnabled, isInitialFetchDone, onGoToSettings }) => {
  const loading = isEnabled && !isInitialFetchDone;
  const copy = !isEnabled ? NOT_ENABLED : loading ? LOADING : NO_EVENTS;
  const action = !isEnabled && (
    <Button variant="primary" size="sm" onClick={onGoToSettings}>
      <Icon icon={Settings} size="xs" />
      Open Settings
    </Button>
  );

  return (
    <div className={`flex-1 flex flex-col ${LAYOUT.listGutter}`}>
      <EmptyState
        icon={loading ? RefreshCw : CalendarDays}
        loading={loading}
        message={copy.message}
        description={copy.description}
        action={action}
      />
    </div>
  );
};

// ─── Component ──────────────────────────────────────────────────────

export const CalendarView: React.FC = () => {
  const { openSettings } = useAppActions();
  const phone = useFormFactor() === 'phone';
  const span: CalendarSpan = phone ? 'day' : 'week';
  const { scheduleXEvents, isEmpty, isEnabled, isInitialFetchDone, refresh } = useCalendarEvents();
  const [isSyncing, setIsSyncing] = useState(false);
  const [rangeLabel, setRangeLabel] = useState('');
  const [currentRange, setCurrentRange] = useState<{ start: string; end: string } | null>(null);
  const controlsRef = useRef<CalendarControls | null>(null);

  const [popoverEvent, setPopoverEvent] = useState<ScheduleXCalendarEvent | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);

  const handleGoToSettings = useCallback(() => openSettings('integrations'), [openSettings]);

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

  const showCalendar = isEnabled && !isEmpty;
  const unit = span === 'day' ? 'day' : 'week';

  // Back / forward by the grid's span, with the range it shows.
  const stepper = (
    <div className="flex items-center gap-1.5">
      <IconButton icon={ChevronLeft} label={`Previous ${unit}`} size="sm" variant="outline" onClick={() => controlsRef.current?.goBack()} />
      <IconButton icon={ChevronRight} label={`Next ${unit}`} size="sm" variant="outline" onClick={() => controlsRef.current?.goForward()} />
      {rangeLabel && <Text variant="label" tone="muted" className="whitespace-nowrap">{rangeLabel}</Text>}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in">
      <TitlebarSpacer />
      {/* Header: the title with Go to date, Today and Sync; back / forward and the range beside them on a Mac, under them on iPhone */}
      <Surface as="header" edge="bottom" className={`shrink-0 ${LAYOUT.listGutter} py-2.5 space-y-2`}>
        <div className="flex items-center gap-2">
          <Text as="h1" variant="pageTitle" truncate className="flex-1">{CALENDAR_CONFIG.title}</Text>
          {showCalendar && (
            <>
              {!phone && stepper}
              <DatePicker value={rangeToPickerDate(currentRange)} onChange={handleDatePick} placeholder="Go to date" />
              <Button variant="outline" size="sm" onClick={() => controlsRef.current?.goToToday()}>Today</Button>
              <IconButton icon={RefreshCw} label={isSyncing ? 'Syncing…' : 'Sync'} size="sm" spin={isSyncing} onClick={handleSync} disabled={isSyncing} />
            </>
          )}
        </div>
        {showCalendar && phone && stepper}
      </Surface>

      {/* Content */}
      {showCalendar ? (
        <CalendarWeek
          key={span}
          span={span}
          events={scheduleXEvents}
          onControlsReady={handleControlsReady}
          onEventClick={handleEventClick}
          onRangeUpdate={handleRangeUpdate}
        />
      ) : (
        <CalendarEmptyState
          isEnabled={isEnabled}
          isInitialFetchDone={isInitialFetchDone}
          onGoToSettings={handleGoToSettings}
        />
      )}

      {/* Event detail popover */}
      {popoverEvent && popoverRect && (
        <EventPopover
          event={popoverEvent}
          anchorRect={popoverRect}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
};
