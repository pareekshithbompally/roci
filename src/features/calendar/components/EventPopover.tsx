/** One calendar occurrence, read-only: its header, the call, invitees, the calendar and notes, plus Roci's own Open meeting
 *  and Record / Join & Record. The kit's detail parts lay it out (Calendar.app's popover on a Mac, a sheet on a phone). */

import React, { useMemo } from 'react';
import { ArrowUpRight, Users, Video } from 'lucide-react';
import { CardRow, DetailHeader, DetailList, DetailNotes, IconButton, IconTile, Popover, PopoverAnchor, PopoverContent, Text, showToast } from '@shared/ui';
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
    .replace(/[-─~:_=]{4,}/g, '')                     // separator rules (Google Meet ::~:~::, Teams ______)
    .replace(/Join with Google Meet/gi, '')
    .replace(/Get more info about Meet at:?/gi, '')
    .replace(/Learn more about Meet at:?/gi, '')
    .replace(/Please do not edit this section\.?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const EventPopover: React.FC<EventPopoverProps> = ({ event, anchorRect, onClose }) => {
  // The grid hands over where the event was drawn; the kit popover anchors to it (a sheet on a phone), flips at edges,
  // and closes itself (Esc, click away).
  const anchor = useMemo(() => ({ current: { getBoundingClientRect: () => anchorRect } }), [anchorRect]);
  const { meeting, action, openMeeting, record } = useEventActions(event);

  const people = event.attendees.filter((a) => a.status !== 'declined').map((a) => a.name ?? a.email ?? CALENDAR_CONFIG.unknownPerson);
  const notes = event.notes ? cleanDescription(event.notes, event.meeting_url) : '';

  const handleOpen = () => {
    onClose();
    openMeeting().catch((error: unknown) => console.error('[EventPopover] Opening the meeting failed:', error));
  };
  const handleRecord = () => {
    onClose();
    record().catch((error: unknown) => {
      console.error('[EventPopover] Starting the recording failed:', error);
      showToast(CALENDAR_CONFIG.recordFailed, 'error');
    });
  };
  const join = event.meeting_url
    ? { label: CALENDAR_CONFIG.joinLabel, onPress: () => openUrl(event.meeting_url!).catch((error: unknown) => console.error('[EventPopover] Opening the call failed:', error)) }
    : undefined;

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent side="right" align="center" width="lg" label={event.title} className="p-3 space-y-2">
        <div className="flex flex-col gap-section">
          <DetailHeader
            tint={event.calendar_color}
            title={event.title}
            subtitle={formatEventWhen(event)}
            detail={event.location}
            action={meeting && <IconButton icon={ArrowUpRight} label={CALENDAR_CONFIG.openMeetingLabel} size="sm" onClick={handleOpen} />}
          />
          <DetailList>
            {(event.meeting_url || action) && (
              <CardRow leading={<IconTile icon={Video} />} title={event.meeting_provider ?? CALENDAR_CONFIG.noCallLink} action={join} />
            )}
            {action && <CardRow title={CALENDAR_CONFIG.recordLabels[action]} tone="accent" onPress={handleRecord} />}
            {people.length > 0 && (
              <CardRow
                leading={<IconTile icon={Users} />}
                title={CALENDAR_CONFIG.inviteesLabel}
                description={people.slice(0, INVITEES_SHOWN).join(', ') + (people.length > INVITEES_SHOWN ? ` +${people.length - INVITEES_SHOWN}` : '')}
              />
            )}
            <CardRow title={CALENDAR_CONFIG.calendarLabel} actions={<Text tone="muted" truncate>{event.calendar_name}</Text>} />
          </DetailList>
          {notes && <DetailNotes>{notes}</DetailNotes>}
        </div>
      </PopoverContent>
    </Popover>
  );
};
