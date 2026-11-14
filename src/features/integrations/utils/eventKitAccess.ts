import type { PermissionState } from '@services/permissions.service';
import type { CalendarAccessStatus } from '@services/calendar/types';

/** EventKit authorization (calendars, reminders) in the shared permission vocabulary. */
export function eventKitAccess(status: CalendarAccessStatus): PermissionState {
  if (status === 'authorized') return 'ready';
  if (status === 'not_determined') return 'needs-request';
  return 'needs-settings';
}
