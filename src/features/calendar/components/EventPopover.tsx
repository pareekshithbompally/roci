/** Event detail popover with one card per section (meeting link, date/alerts, invitees, notes). */

import React, { useEffect, useRef, useCallback } from 'react';
import { X, Video } from 'lucide-react';
import { Icon, IconButton, Surface, Text } from '@shared/ui';
import type { CalendarEvent as ScheduleXCalendarEvent } from '@schedule-x/calendar';

interface EventPopoverProps {
  event: ScheduleXCalendarEvent;
  anchorRect: DOMRect | null;
  onClose: () => void;
}

/** Parse a Temporal ZonedDateTime or ISO string, dropping the `[Zone]` suffix Date can't read. */
function parseToDate(value: unknown): Date | null {
  if (!value) return null;
  const str = String(value).replace(/\[.*\]$/, ''); // strip [timezone] annotation
  try {
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function formatTime(value: unknown): string {
  const date = parseToDate(value);
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateLine(value: unknown): string {
  const date = parseToDate(value);
  if (!date) return '';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Clean description: strip URLs, separators, HTML, Google Meet boilerplate, unicode junk */
function cleanDescription(desc: string, meetingUrl: string | null): string {
  let cleaned = desc;
  if (meetingUrl) {
    cleaned = cleaned.replace(/https?:\/\/[^\s)>]+/g, '');
  }
  cleaned = cleaned
    .replace(/<[^>]*>/g, '')
    .replace(/[-─~:]{4,}/g, '')                       // Google Meet separator junk (::~:~::~:~)
    .replace(/Join with Google Meet/gi, '')
    .replace(/Get more info about Meet at:?/gi, '')
    .replace(/Learn more about Meet at:?/gi, '')
    .replace(/Please do not edit this section\.?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned;
}

export const EventPopover: React.FC<EventPopoverProps> = ({ event, anchorRect, onClose }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [handleClickOutside, handleEscape]);

  // Position near anchor
  const style: React.CSSProperties = {};
  if (anchorRect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = 288; // w-72
    const ph = 380;

    let left = anchorRect.right + 10;
    if (left + pw > vw - 16) left = anchorRect.left - pw - 10;
    if (left < 16) left = 16;

    let top = anchorRect.top + anchorRect.height / 2 - ph / 2;
    if (top + ph > vh - 16) top = vh - ph - 16;
    if (top < 16) top = 16;

    style.position = 'fixed';
    style.left = left;
    style.top = top;
  }

  const location = event.location as string | undefined;
  const description = event.description as string | undefined;
  const people = event.people as string[] | undefined;
  const startStr = formatTime(event.start);
  const endStr = formatTime(event.end);
  const dateStr = formatDateLine(event.start);
  const meetingUrl = (event.meetingUrl as string | null | undefined) ?? null;
  const meetingProvider = (event.meetingProvider as string | null | undefined) ?? 'Video call';
  const cleanedDesc = description ? cleanDescription(description, meetingUrl) : '';

  return (
    <Surface
      ref={popoverRef}
      variant="floating"
      radius="xl"
      style={style}
      className="z-popover w-72 animate-fade-in overflow-hidden"
    >
      {/* ── Title card ── */}
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <Text as="h3" variant="title" className="flex-1">
            {event.title}
          </Text>
          <IconButton icon={X} label="Close" size="sm" className="shrink-0" onClick={onClose} />
        </div>
        {location && (
          <Text as="p" variant="helper" tone="muted" truncate className="mt-0.5">{location}</Text>
        )}
      </div>

      {/* ── Cards stack ── */}
      <div className="px-3 pb-3 space-y-2">
        {/* Meeting link card */}
        {meetingUrl && (
          <Surface
            as="a"
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="card"
            radius="xl"
            interactive
            className="group flex items-center gap-3 px-3.5 py-2.5"
          >
            <Icon icon={Video} size="sm" tone="muted" className="shrink-0" />
            <Text tone="muted" truncate className="flex-1">
              {meetingProvider}
            </Text>
            <Text variant="label" tone="accent" className="group-hover:underline">
              Join
            </Text>
          </Surface>
        )}

        {/* Date & time card */}
        <Surface variant="card" radius="xl" className="px-3.5 py-2.5">
          <Text as="p" variant="bodyStrong">
            {dateStr}
            {startStr && (
              <Text tone="muted" className="ml-2">
                {startStr}{endStr ? ` – ${endStr}` : ''}
              </Text>
            )}
          </Text>
        </Surface>

        {/* Invitees card */}
        {people && people.length > 0 && (
          <Surface variant="card" radius="xl" className="px-3.5 py-2.5">
            <Text as="p" variant="caption" tone="faint" className="uppercase tracking-wider mb-1.5">
              Invitees
            </Text>
            <div className="space-y-1">
              {people.slice(0, 5).map((name, i) => (
                <Text as="p" key={i} tone="muted" truncate>
                  {name}
                </Text>
              ))}
              {people.length > 5 && (
                <Text as="p" variant="helper" tone="faint">
                  +{people.length - 5} more
                </Text>
              )}
            </div>
          </Surface>
        )}

        {/* Notes / description card */}
        {cleanedDesc && (
          <Surface variant="card" radius="xl" className="px-3.5 py-2.5">
            <Text as="p" variant="caption" tone="faint" className="uppercase tracking-wider mb-1.5">
              Notes
            </Text>
            <Text as="p" variant="helper" tone="muted" className="line-clamp-4 break-words whitespace-pre-line leading-relaxed">
              {cleanedDesc}
            </Text>
          </Surface>
        )}
      </div>
    </Surface>
  );
};
