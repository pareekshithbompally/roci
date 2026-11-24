/** Upcoming: the calendar's events on a time grid, a week on a Mac and a day on iPhone, any week back or forward; live on calendar changes. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CircleAlert, Lock, RotateCw, Settings } from 'lucide-react';
import { useAppActions } from '@shared/stores/appStore';
import { useSystemFormatStore } from '@shared/stores/systemFormatStore';
import { Button, DateStepper, Icon, useListBesideDetail, ViewHeader } from '@shared/ui';
import { EmptyState } from '@shared/components';
import { useCalendarControls } from '@features/integrations';
import { LAYOUT } from '@config/layout.config';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { addDays, localDayKey } from '@shared/utils/localDate';
import { useRangeEvents } from '@features/calendar/hooks/useRangeEvents';
import { visibleRange, type CalendarSpan } from '@features/calendar/utils/timeGrid';
import { TimeGrid } from './TimeGrid';
import { EventPopover } from './EventPopover';
import { calendarService, type CalendarEvent } from '@services/calendar';

const { states } = CALENDAR_CONFIG;
const OFF = { icon: CalendarDays, ...states.off };
const READ_FAILED = { icon: CircleAlert, ...states.readFailed };
const NO_ACCESS = { icon: Lock, ...states.noAccess };

export const CalendarView: React.FC = () => {
  const { openSettings } = useAppActions();
  const calendar = useCalendarControls();
  const span: CalendarSpan = useListBesideDetail() ? 'week' : 'day';
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
  // As Calendar: the month is the title (it opens the system date picker), back · forward beside it; Today only once you've
  // moved away from it.
  const awayFromToday = picked !== null && !range.days.some((day) => localDayKey(day) === today);
  const todayButton = awayFromToday && <Button variant="link" size="inline" onClick={() => setPicked(null)}>{CALENDAR_CONFIG.today}</Button>;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in">
      <ViewHeader fullWidth title={CALENDAR_CONFIG.title} accessory={!empty && todayButton}>
        {!empty && <DateStepper date={anchor} unit={unit} onStep={step} onPick={(day) => setPicked(new Date(`${day}T00:00`))} />}
      </ViewHeader>

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
