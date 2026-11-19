/** One calendar occurrence: title with Open meeting (when Roci recorded it), Record / Join & Record while recordable, call link, time, invitees, notes. */

import React, { useMemo } from 'react';
import { ArrowUpRight, Circle, Video, X } from 'lucide-react';
import { Button, Icon, IconButton, Popover, PopoverAnchor, PopoverContent, Surface, Text, showToast } from '@shared/ui';
import { CALENDAR_CONFIG } from '@config/calendar.config';
import { formatClockTime, formatDate } from '@shared/utils/formatters';
import { useEventActions } from '@features/calendar/hooks/useEventActions';
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

const Section: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <Surface variant="card" radius="xl" className="px-3.5 py-2.5">
    {title && <Text as="p" variant="caption" tone="faint" className="uppercase tracking-wider mb-1.5">{title}</Text>}
    {children}
  </Surface>
);

export const EventPopover: React.FC<EventPopoverProps> = ({ event, anchorRect, onClose }) => {
  // The grid hands over where the event was drawn; the kit popover anchors to it, flips at edges, and closes itself.
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

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent side="right" align="center" width="lg" className="overflow-hidden">
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-start gap-1">
            <Text as="h3" variant="title" className="flex-1">{event.title}</Text>
            {meeting && <IconButton icon={ArrowUpRight} label="Open meeting" size="sm" className="shrink-0" onClick={handleOpen} />}
            <IconButton icon={X} label="Close" size="sm" className="shrink-0" onClick={onClose} />
          </div>
          {event.location && <Text as="p" variant="helper" tone="muted" truncate className="mt-0.5">{event.location}</Text>}
          {action && (
            <Button variant="accent" size="sm" className="mt-2.5" onClick={handleRecord}>
              <Icon icon={action === 'join' ? Video : Circle} size="xs" />
              {CALENDAR_CONFIG.recordLabels[action]}
            </Button>
          )}
        </div>

        <div className="px-3 pb-3 space-y-2">
          {event.meeting_url && (
            <Surface
              as="a"
              href={event.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              variant="card"
              radius="xl"
              interactive
              className="group flex items-center gap-3 px-3.5 py-2.5"
            >
              <Icon icon={Video} size="sm" tone="muted" className="shrink-0" />
              <Text tone="muted" truncate className="flex-1">{event.meeting_provider ?? 'Video call'}</Text>
              <Text variant="label" tone="accent" className="group-hover:underline">Join</Text>
            </Surface>
          )}

          <Section>
            <Text as="p" variant="bodyStrong">
              {formatDate(event.start_date)}
              <Text tone="muted" className="ml-2">{formatClockTime(event.start_date)} – {formatClockTime(event.end_date)}</Text>
            </Text>
          </Section>

          {people.length > 0 && (
            <Section title="Invitees">
              <div className="space-y-1">
                {people.slice(0, INVITEES_SHOWN).map((name, i) => <Text as="p" key={i} tone="muted" truncate>{name}</Text>)}
                {people.length > INVITEES_SHOWN && (
                  <Text as="p" variant="helper" tone="faint">+{people.length - INVITEES_SHOWN} more</Text>
                )}
              </div>
            </Section>
          )}

          {notes && (
            <Section title="Notes">
              <Text as="p" variant="helper" tone="muted" className="line-clamp-4 break-words whitespace-pre-line leading-relaxed">
                {notes}
              </Text>
            </Section>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
