/** What a calendar occurrence offers: its Roci meeting (to open) and, on a Mac while it is recordable, Record / Join & Record. */

import { useCallback } from 'react';
import { useOpenMeeting } from '@features/history';
import { useRecordingMeetingId } from '@features/recording';
import { useSettings } from '@shared/contexts/SettingsContext';
import { recordCalendarEvent } from '@services/calendar';
import { platform } from '@platform/index';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@config/notifications.config';
import { recordAction, type RecordAction } from '@features/calendar/utils/recordWindow';
import { useMeetingForOccurrence } from './useMeetingForOccurrence';
import type { CalendarEvent } from '@services/calendar';
import type { HistoryItem } from '@shared/types';

export interface EventActions {
  meeting: HistoryItem | null;
  action: RecordAction | null;
  openMeeting: () => Promise<void>;
  record: () => Promise<void>;
}

export function useEventActions(event: CalendarEvent): EventActions {
  const meeting = useMeetingForOccurrence(event);
  const open = useOpenMeeting();
  const recording = useRecordingMeetingId() !== null;
  const { settings } = useSettings();
  const lead = (settings.notifications ?? DEFAULT_NOTIFICATION_SETTINGS).meetingLeadMinutes;
  const action = platform.canRecordFromCalendar
    ? recordAction(event, Date.now(), lead, { recording, hasMeeting: meeting !== null })
    : null;

  const openMeeting = useCallback(async () => {
    if (meeting) await open(meeting);
  }, [meeting, open]);
  const record = useCallback(() => recordCalendarEvent(event, action === 'join'), [event, action]);

  return { meeting, action, openMeeting, record };
}
