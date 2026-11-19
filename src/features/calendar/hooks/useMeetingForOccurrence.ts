/** The Roci meeting recorded from a calendar occurrence, read from the meetings already loaded for the sidebar. */

import { useQuery } from '@tanstack/react-query';
import { meetingsQuery } from '@shared/contexts/HistoryContext';
import { findMeetingForOccurrence } from '@services/calendar';
import type { CalendarEvent } from '@services/calendar';
import type { HistoryItem } from '@shared/types';

export function useMeetingForOccurrence(event: CalendarEvent | null): HistoryItem | null {
  const { data: meetings = [] } = useQuery(meetingsQuery);
  return event ? findMeetingForOccurrence(meetings, event) : null;
}
