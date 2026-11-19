/** One calendar occurrence as Calendar.app's event popover shows it, read-only: stacked cards (title and time beside the
 *  calendar's colour bar, the call, invitees, the calendar, notes), plus Roci's own: Open meeting and Record / Join & Record. */

import React, { useMemo } from 'react';
import { ArrowUpRight, Circle, Users, Video } from 'lucide-react';
import { Button, Icon, IconButton, Popover, PopoverAnchor, PopoverContent, Surface, Text, showToast } from '@shared/ui';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { openUrl } from '@services/tauri';
import { useEventActions } from '@features/calendar/hooks/useEventActions';
import { formatEventWhen } from '@features/calendar/utils/eventWhen';
import type { CalendarEvent } from '@services/calendar';

interface EventPopoverProps {
  event: CalendarEvent;
  /** Where the clicked event is drawn. */
  anchorRect: DOMRect;
  onClose: () => void;
}

const INVITEES_SHOWN = 5;

/** Clean description: strip URLs, separators, HTML, Google Meet boilerplate */
function cleanDescription(desc: string, meetingUrl: string | null): string {
  let cleaned = desc;
  if (meetingUrl) {
    cleaned = cleaned.replace(/https?:\/\/[^\s)>]+/g, '');
  }
  return cleaned
    .replace(/<[^>]*>/g, '')
    .replace(/[-─~:]{4,}/g, '')                       // Google Meet separator junk (::~:~::~:~)
    .replace(/Join with Google Meet/gi, '')
    .replace(/Get more info about Meet at:?/gi, '')
    .replace(/Learn more about Meet at:?/gi, '')
    .replace(/Please do not edit this section\.?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const EventPopover: React.FC<EventPopoverProps> = ({ event, anchorRect, onClose }) => {
  // The grid hands over where the event was drawn; the kit popover anchors to it, flips at edges, and closes itself (Esc, click away).
  const anchor = useMemo(() => ({ current: { getBoundingClientRect: () => anchorRect } }), [anchorRect]);
  const { meeting, action, openMeeting, record } = useEventActions(event);

  const people = event.attendees.filter((a) => a.status !== 'declined').map((a) => a.name ?? a.email ?? 'Unknown');
  const notes = event.notes ? cleanDescription(event.notes, event.meeting_url) : '';

  const handleOpen = () => {
    onClose();
    openMeeting().catch((error: unknown) => console.error('[EventPopover] Opening the meeting failed:', error));
  };
  const handleRecord = () => {
    onClose();
    record().catch((error: unknown) => {
      console.error('[EventPopover] Starting the recording failed:', error);
      showToast("Couldn't start recording", 'error');
    });
  };
  const handleJoin = (url: string) => {
    openUrl(url).catch((error: unknown) => console.error('[EventPopover] Opening the call failed:', error));
  };

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent side="right" align="center" width="lg" className="p-3 space-y-2">
        {/* Title and time beside the calendar's colour bar */}
        <Surface tint={event.calendar_color} className="flex gap-2">
          <Surface variant="eventBar" radius="full" className="w-1 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Surface variant="inset" radius="xl" className="px-3 py-2.5 flex items-start gap-1">
              <Text as="h3" variant="title" className="flex-1 min-w-0">{event.title}</Text>
              {meeting && <IconButton icon={ArrowUpRight} label="Open meeting" size="sm" className="shrink-0" onClick={handleOpen} />}
            </Surface>
            <Surface variant="inset" radius="xl" className="px-3 py-2.5">
              <Text as="p" variant="body" className="whitespace-pre-wrap">{formatEventWhen(event)}</Text>
              {event.location && <Text as="p" variant="helper" tone="muted" truncate className="mt-1">{event.location}</Text>}
            </Surface>
          </div>
        </Surface>

        {(event.meeting_url || action) && (
          <Surface variant="inset" radius="xl" className="px-3 py-2.5 flex items-center gap-2">
            <Icon icon={Video} size="sm" tone="muted" className="shrink-0" />
            <Text truncate className="flex-1 min-w-0">{event.meeting_provider ?? 'No call link'}</Text>
            {event.meeting_url && (
              <Button variant="outline" size="sm" onClick={() => handleJoin(event.meeting_url!)}>Join</Button>
            )}
            {action && (
              <Button variant="accent" size="sm" onClick={handleRecord}>
                <Icon icon={action === 'join' ? Video : Circle} size="xs" />
                {CALENDAR_CONFIG.recordLabels[action]}
              </Button>
            )}
          </Surface>
        )}

        {people.length > 0 && (
          <Surface variant="inset" radius="xl" className="px-3 py-2.5 flex gap-2">
            <Icon icon={Users} size="sm" tone="muted" className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-0.5">
              {people.slice(0, INVITEES_SHOWN).map((name, i) => <Text as="p" key={i} truncate>{name}</Text>)}
              {people.length > INVITEES_SHOWN && <Text as="p" variant="helper" tone="muted">+{people.length - INVITEES_SHOWN} more</Text>}
            </div>
          </Surface>
        )}

        <Surface tint={event.calendar_color}>
          <Surface variant="inset" radius="xl" className="px-3 py-2.5 flex items-center gap-2">
            <Surface variant="eventBar" radius="full" className="w-2.5 h-2.5 shrink-0" />
            <Text truncate>{event.calendar_name}</Text>
          </Surface>
        </Surface>

        {notes && (
          <Surface variant="inset" radius="xl" className="px-3 py-2.5">
            <Text as="p" variant="helper" tone="muted" className="line-clamp-4 break-words whitespace-pre-line">{notes}</Text>
          </Surface>
        )}
      </PopoverContent>
    </Popover>
  );
};
