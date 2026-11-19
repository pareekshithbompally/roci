/** Calendar types shared by the calendar service, notifications and meeting metadata. */

import { CALENDAR_CONFIG } from '@config/calendar.config';

/** A participant in a calendar event. */
export interface CalendarAttendee {
  name?: string;
  email?: string;
  status: 'accepted' | 'declined' | 'tentative' | 'pending';
  is_organizer: boolean;
  /** Whether this attendee represents the device owner (macOS EKParticipant.isCurrentUser) */
  is_current_user?: boolean;
}

/** A calendar event from macOS EventKit. */
export interface CalendarEvent {
  event_id: string;
  title: string;
  start_date: string;
  end_date: string;
  organizer_name?: string;
  organizer_email?: string;
  attendees: CalendarAttendee[];
  location?: string;
  notes?: string;
  url?: string;
  calendar_name: string;
  /** The calendar's own colour (`#rrggbb`), as Calendar.app tints its events. */
  calendar_color?: string;
  is_all_day: boolean;
  /** Wall-clock milliseconds (native scheduler). */
  start_ms: number;
  end_ms: number;
  is_cancelled: boolean;
  /** Shown as free time. */
  is_free: boolean;
  /** Video call link, found natively. */
  meeting_url: string | null;
  /** The call service behind `meeting_url` ("Zoom", "Google Meet", …). */
  meeting_provider: string | null;
}

/** Calendar authorization status. */
export type CalendarAccessStatus = 'authorized' | 'denied' | 'not_determined' | 'restricted';

/** Calendar integration settings stored in AppSettings. */
export interface CalendarIntegrationSettings {
  enabled: boolean;
}

/** Default calendar integration settings. */
export const CALENDAR_DEFAULTS: CalendarIntegrationSettings = {
  enabled: CALENDAR_CONFIG.defaultEnabled,
};
