/**
 * Meeting URL Extraction
 *
 * Extracts video call URLs from calendar event fields.
 * Checks url, location, and notes in priority order.
 */

import type { CalendarEvent } from './types';

/** Known video conferencing URL patterns. */
const MEETING_URL_PATTERNS: RegExp[] = [
  // Zoom
  /https?:\/\/[\w.-]*zoom\.us\/[jw]\/[\w?=&%-]+/i,
  // Google Meet
  /https?:\/\/meet\.google\.com\/[\w-]+/i,
  // Microsoft Teams
  /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[\w%+./-]+/i,
  // Webex
  /https?:\/\/[\w.-]*webex\.com\/[\w./-]+/i,
  // Around
  /https?:\/\/[\w.-]*around\.co\/[\w/-]+/i,
  // Whereby
  /https?:\/\/[\w.-]*whereby\.com\/[\w/-]+/i,
  // Generic video call link (fallback — matches common patterns)
  /https?:\/\/[\w.-]+\/(?:join|meeting|call)\/[\w?=&%-]+/i,
];

/**
 * Extract a video call URL from a calendar event.
 * Searches url → location → notes in priority order.
 * Returns the first match, or null if none found.
 */
export function extractMeetingUrl(event: CalendarEvent): string | null {
  // Priority 1: event.url (often set by calendar providers for video calls)
  if (event.url) {
    const fromUrl = matchMeetingUrl(event.url);
    if (fromUrl) return fromUrl;
  }

  // Priority 2: location field (common for Zoom/Meet links)
  if (event.location) {
    const fromLocation = matchMeetingUrl(event.location);
    if (fromLocation) return fromLocation;
  }

  // Priority 3: notes/description (sometimes contains meeting link)
  if (event.notes) {
    const fromNotes = matchMeetingUrl(event.notes);
    if (fromNotes) return fromNotes;
  }

  return null;
}

/** Match the first known video call URL in a string. */
function matchMeetingUrl(text: string): string | null {
  for (const pattern of MEETING_URL_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}
