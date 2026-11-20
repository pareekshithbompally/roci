/** Upcoming: the calendar's events on a time grid, a week on a Mac and a day on iPhone, any week back or forward; live on calendar changes. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Lock, RotateCw, Settings } from 'lucide-react';
import { useAppActions } from '@shared/stores/appStore';
import { useSystemFormatStore } from '@shared/stores/systemFormatStore';
import { DatePicker, Button, Icon, IconButton, Surface, Text, TitlebarSpacer } from '@shared/ui';
import { EmptyState } from '@shared/components';
import { useCalendarControls } from '@features/integrations';
import { useFormFactor } from '@platform/formFactor';
import { LAYOUT } from '@config/layout.config';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { formatMonth } from '@shared/utils/formatters';
import { addDays, localDayKey } from '@shared/utils/localDate';
import { useRangeEvents } from '@features/calendar/hooks/useRangeEvents';
import { visibleRange, type CalendarSpan } from '@features/calendar/utils/timeGrid';
import { TimeGrid } from './TimeGrid';
import { EventPopover } from './EventPopover';
import { calendarService, type CalendarEvent } from '@services/calendar';

const OFF = {
  icon: CalendarDays,
  message: 'Calendar integration is not enabled',
  description: 'Enable calendar integration in Settings to see your upcoming events.',
};
const READ_FAILED = {
  icon: CircleAlert,
  message: "Couldn't read your calendar",
  description: 'macOS did not return your events. Try again, or check Calendar access in System Settings.',
};
const NO_ACCESS = {
  icon: Lock,
  message: 'Calendar access is off',
  description: 'Allow Roci to read your calendars to see your events here.',
};

export const CalendarView: React.FC = () => {
  const { openSettings } = useAppActions();
  const calendar = useCalendarControls();
  const span: CalendarSpan = useFormFactor() === 'phone' ? 'day' : 'week';
  // The day on screen: `null` follows today (a new day or wake moves it, via `calendar://changed`); a picked day stays.
  const [today, setToday] = useState(() => localDayKey(new Date()));
  const [picked, setPicked] = useState<Date | null>(null);
  useEffect(() => calendarService.onCalendarChanged(() => setToday(localDayKey(new Date()))), []);
  const anchor = useMemo(() => picked ?? new Date(`${today}T00:00`), [picked, today]);
  const [selected, setSelected] = useState<{ event: CalendarEvent; rect: DOMRect } | null>(null);

  const firstWeekday = useSystemFormatStore((s) => s.firstWeekday);
  const range = useMemo(() => visibleRange(anchor, span, firstWeekday), [anchor, span, firstWeekday]);
  const blocked = calendar.access === 'needs-request' || calendar.access === 'needs-settings';
  const { events, allDay, isError, retry } = useRangeEvents(range, calendar.enabled && !blocked);

  const step = useCallback((direction: 1 | -1) => {
    setPicked(addDays(anchor, direction * range.days.length));
  }, [anchor, range.days.length]);
  const handleEventClick = useCallback((event: CalendarEvent, rect: DOMRect) => setSelected({ event, rect }), []);

  const empty = !calendar.enabled ? OFF : blocked ? NO_ACCESS : isError ? READ_FAILED : null;
  const unit = span === 'day' ? 'day' : 'week';
  // As Calendar: the month (it opens the system date picker), then back · Today · forward. One date on screen, one format.
  const controls = (
    <div className="flex items-center gap-1.5">
      <DatePicker value={localDayKey(anchor)} onChange={(v) => v && setPicked(new Date(`${v}T00:00`))} placeholder="Go to date">
        {formatMonth(anchor)}
      </DatePicker>
      <IconButton icon={ChevronLeft} label={`Previous ${unit}`} size="sm" variant="outline" onClick={() => step(-1)} />
      <Button variant="outline" size="sm" onClick={() => setPicked(null)}>Today</Button>
      <IconButton icon={ChevronRight} label={`Next ${unit}`} size="sm" variant="outline" onClick={() => step(1)} />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in">
      <TitlebarSpacer />
      {/* Header: the title, with the month and back · Today · forward beside it on a Mac, under it on iPhone */}
      <Surface as="header" edge="bottom" className={`shrink-0 ${LAYOUT.listGutter} py-2.5 space-y-2`}>
        <div className="flex items-center gap-2">
          <Text as="h1" variant="pageTitle" truncate className="flex-1">{CALENDAR_CONFIG.title}</Text>
          {!empty && span === 'week' && controls}
        </div>
        {!empty && span === 'day' && controls}
      </Surface>

      {empty ? (
        <div className={`flex-1 flex flex-col ${LAYOUT.listGutter}`}>
          <EmptyState
            icon={empty.icon}
            message={empty.message}
            description={empty.description}
            action={empty === READ_FAILED ? (
              <Button variant="primary" size="sm" onClick={retry}>
                <Icon icon={RotateCw} size="xs" />
                Try Again
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={blocked ? calendar.openSettings : () => openSettings('integrations')}>
                <Icon icon={Settings} size="xs" />
                Open Settings
              </Button>
            )}
          />
        </div>
      ) : (
        <TimeGrid days={range.days} events={events} allDay={allDay} onEventClick={handleEventClick} />
      )}

      {selected && <EventPopover event={selected.event} anchorRect={selected.rect} onClose={() => setSelected(null)} />}
    </div>
  );
};
