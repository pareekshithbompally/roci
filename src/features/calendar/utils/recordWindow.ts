/** Whether a calendar event offers Record / Join & Record now: from the reminder lead time before it starts until it ends. */

import { MS_PER_MINUTE } from '@shared/utils/localDate';
import type { CalendarEvent } from '@services/calendar';

export type RecordAction = 'join' | 'record';


/** `join` with a call link, `record` without; null when recording, already recorded, too early or over. */
export function recordAction(
  event: CalendarEvent,
  now: number,
  leadMinutes: number,
  state: { recording: boolean; hasMeeting: boolean },
): RecordAction | null {
  if (state.recording || state.hasMeeting) return null;
  if (now < event.start_ms - leadMinutes * MS_PER_MINUTE || now >= event.end_ms) return null;
  return event.meeting_url ? 'join' : 'record';
}
