/** One event on the time grid, as Calendar draws it: a tinted block with a leading bar, the title, a clock and its times. */

import React from 'react';
import { Clock, Link2 } from 'lucide-react';
import { Icon, Surface, Text } from '@shared/ui';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { formatClockTime } from '@shared/utils/formatters';
import { useMeetingForOccurrence } from '@features/calendar/hooks/useMeetingForOccurrence';
import type { GridBlock } from '@features/calendar/utils/timeGrid';
import type { CalendarEvent } from '@services/calendar';

const { hourHeight, laneGapPx } = CALENDAR_CONFIG.grid;
const MINUTES_PER_HOUR = 60;

/** Position from minutes and lanes: computed geometry, not design values. */
function geometry({ top, height, lane, lanes }: GridBlock): React.CSSProperties {
  return {
    top: (top / MINUTES_PER_HOUR) * hourHeight + laneGapPx,
    height: (height / MINUTES_PER_HOUR) * hourHeight - laneGapPx * 2,
    left: `calc(${(lane / lanes) * 100}% + ${laneGapPx}px)`,
    width: `calc(${100 / lanes}% - ${laneGapPx * 2}px)`,
  };
}

interface EventBlockProps {
  block: GridBlock;
  onClick: (event: CalendarEvent, rect: DOMRect) => void;
}

export const EventBlock: React.FC<EventBlockProps> = ({ block, onClick }) => {
  const { event } = block;
  const recorded = useMeetingForOccurrence(event) !== null;
  return (
    <Surface
      variant="event"
      tint={event.calendar_color}
      radius="md"
      interactive
      role="button"
      aria-label={event.title}
      className="absolute flex gap-1.5 overflow-hidden p-1"
      style={geometry(block)}
      onClick={(e) => onClick(event, e.currentTarget.getBoundingClientRect())}
    >
      <Surface variant="eventBar" radius="full" className="w-1 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <Text variant="headline" tone="event" truncate className="flex-1">{event.title}</Text>
          {recorded && <Icon icon={Link2} size="xs" className="shrink-0" />}
        </div>
        <Text as="p" variant="helper" tone="event" truncate className="flex items-center gap-1">
          <Icon icon={Clock} size="xs" />
          {formatClockTime(event.start_date)} – {formatClockTime(event.end_date)}
        </Text>
      </div>
    </Surface>
  );
};
