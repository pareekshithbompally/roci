/**
 * Calendar Integration Types
 *
 * Types shared between the calendar service, notification system,
 * and meeting metadata pipeline.
 */

import { CALENDAR_CONFIG } from '../../src/config/calendar.config';

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
  is_all_day: boolean;
}

/** Calendar authorization status. */
export type CalendarAccessStatus = 'authorized' | 'denied' | 'not_determined' | 'restricted';

/** Calendar event enriched with derived fields for the frontend. */
export interface EnrichedCalendarEvent extends CalendarEvent {
  /** Extracted video call URL (Zoom, Meet, Teams, etc.) */
  meeting_url: string | null;
  /** Non-declined attendee count */
  active_participant_count: number;
}

/** Calendar integration settings stored in AppSettings. */
export interface CalendarIntegrationSettings {
  enabled: boolean;
  /** Minutes before meeting start to show notification. */
  notify_minutes_before: number;
}

/** Default calendar integration settings. */
export const CALENDAR_DEFAULTS: CalendarIntegrationSettings = {
  enabled: CALENDAR_CONFIG.defaultEnabled,
  notify_minutes_before: CALENDAR_CONFIG.defaultNotifyMinutesBefore,
};
