/**
 * EventPopover Component
 *
 * macOS Calendar-inspired event detail popover with card-based sections.
 * Each section (meeting link, date/alerts, invitees, notes) is a distinct card.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { X, Video, ExternalLink } from 'lucide-react';
import { TEXT } from '@config/theme.config';
import type { CalendarEvent as ScheduleXCalendarEvent } from '@schedule-x/calendar';

interface EventPopoverProps {
  event: ScheduleXCalendarEvent;
  anchorRect: DOMRect | null;
  onClose: () => void;
}

/**
 * Parse a Temporal ZonedDateTime string or plain ISO string into a Date.
 * Temporal format: "2026-03-29T21:25:00+05:30[Asia/Calcutta]"
 * Strip the bracket annotation so Date can parse the offset portion.
 */
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

/** Extract a meeting URL (Zoom, Meet, Teams, Webex) from text */
function extractMeetingUrl(text?: string): string | null {
  if (!text) return null;
  const match = text.match(
    /https?:\/\/[\w.-]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com)[^\s)>]*/i
  );
  return match?.[0] ?? null;
}

/** Get the meeting service domain label */
function getMeetingLabel(url: string): string {
  if (url.includes('meet.google.com')) return 'meet.google.com';
  if (url.includes('zoom.us')) return 'zoom.us';
  if (url.includes('teams.microsoft.com')) return 'teams.microsoft.com';
  if (url.includes('webex.com')) return 'webex.com';
  return 'Video call';
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

/** Inner card: inset surface with subtle border, like macOS Calendar sections */
const CARD_STYLE: React.CSSProperties = {
  background: 'var(--surface-input-field)',
  borderColor: 'var(--border-default)',
};
const CARD_CLASS = 'rounded-xl border';

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
    const pw = 300;
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
    style.zIndex = 200;
  }

  const location = event.location as string | undefined;
  const description = event.description as string | undefined;
  const people = event.people as string[] | undefined;
  const startStr = formatTime(event.start);
  const endStr = formatTime(event.end);
  const dateStr = formatDateLine(event.start);
  const meetingUrl = extractMeetingUrl(description);
  const cleanedDesc = description ? cleanDescription(description, meetingUrl) : '';

  return (
    <div
      ref={popoverRef}
      style={{
        ...style,
        background: 'var(--surface-modal)',
        borderColor: 'var(--border-default)',
        boxShadow: 'var(--shadow-modal)',
      }}
      className="w-[300px] rounded-2xl border animate-fade-in overflow-hidden"
    >
      {/* ── Title card ── */}
      <div className={`px-4 pt-3.5 pb-3`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-[15px] font-semibold ${TEXT.heading} leading-snug flex-1`}>
            {event.title}
          </h3>
          <button
            onClick={onClose}
            className={`shrink-0 p-1 rounded-md ${TEXT.faint} hover:bg-[var(--surface-hover-subtle)] transition-colors`}
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {location && (
          <p className={`text-[12.5px] ${TEXT.muted} mt-0.5 truncate`}>{location}</p>
        )}
      </div>

      {/* ── Cards stack ── */}
      <div className="px-3 pb-3 space-y-2">
        {/* Meeting link card */}
        {meetingUrl && (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={CARD_STYLE}
            className={`${CARD_CLASS} flex items-center gap-3 px-3.5 py-2.5 group transition-colors`}
          >
            <Video className={`w-4 h-4 ${TEXT.muted} shrink-0`} />
            <span className={`text-[13px] ${TEXT.secondary} flex-1 truncate`}>
              {getMeetingLabel(meetingUrl)}
            </span>
            <span className={`text-[12px] font-medium ${TEXT.link} group-hover:underline`}>
              Join
            </span>
          </a>
        )}

        {/* Date & time card */}
        <div style={CARD_STYLE} className={`${CARD_CLASS} px-3.5 py-2.5`}>
          <p className={`text-[13px] ${TEXT.heading} font-medium`}>
            {dateStr}
            {startStr && (
              <span className={`${TEXT.secondary} font-normal ml-2`}>
                {startStr}{endStr ? ` – ${endStr}` : ''}
              </span>
            )}
          </p>
        </div>

        {/* Invitees card */}
        {people && people.length > 0 && (
          <div style={CARD_STYLE} className={`${CARD_CLASS} px-3.5 py-2.5`}>
            <p className={`text-[11px] uppercase tracking-wider ${TEXT.faint} mb-1.5 font-medium`}>
              Invitees
            </p>
            <div className="space-y-1">
              {people.slice(0, 5).map((name, i) => (
                <p key={i} className={`text-[13px] ${TEXT.secondary} truncate`}>
                  {name}
                </p>
              ))}
              {people.length > 5 && (
                <p className={`text-[12px] ${TEXT.faint}`}>
                  +{people.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Notes / description card */}
        {cleanedDesc && (
          <div style={CARD_STYLE} className={`${CARD_CLASS} px-3.5 py-2.5`}>
            <p className={`text-[11px] uppercase tracking-wider ${TEXT.faint} mb-1.5 font-medium`}>
              Notes
            </p>
            <p className={`text-[12.5px] ${TEXT.muted} line-clamp-4 break-words whitespace-pre-line leading-relaxed`}>
              {cleanedDesc}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
