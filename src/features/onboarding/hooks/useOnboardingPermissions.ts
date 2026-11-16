/** The first-run permission rows: recording's own (Rust core) plus notifications and calendar, in one vocabulary. */

import { useMemo } from 'react';
import { usePermissions } from '@features/recording';
import { useNotificationControls } from '@features/notifications';
import { useCalendarControls } from '@features/integrations';
import { permissionsService, type PermissionKind, type PermissionState } from '@services/permissions.service';
import { platform } from '@platform/index';
import { ONBOARDING_CONFIG, type OnboardingPermissionId } from '@config/onboarding.config';
import type { IntegrationAccess } from '@features/integrations';

export interface OnboardingPermission {
  id: OnboardingPermissionId;
  /** `unknown` until the first check answers. */
  access: PermissionState | 'unknown';
  request: () => void;
  openSettings: () => void;
}

type Candidate = Omit<OnboardingPermission, 'access'> & { access: IntegrationAccess };

const shown = (access: IntegrationAccess): access is OnboardingPermission['access'] => access !== 'unavailable';

function report(id: string, action: string) {
  return (error: unknown) => console.error(`[useOnboardingPermissions] ${id} ${action} failed:`, error);
}

export function useOnboardingPermissions() {
  const { data: recordingRows = [], request } = usePermissions(platform.canRecord);
  const notifications = useNotificationControls();
  const calendar = useCalendarControls();

  const rows = useMemo<OnboardingPermission[]>(() => {
    const recording = (kind: PermissionKind): Candidate => ({
      id: kind,
      access: recordingRows.find((row) => row.kind === kind)?.state ?? 'unknown',
      request: () => { request(kind).catch(report(kind, 'request')); },
      // Opens the pane with the floating guide to drag Roci into the list.
      openSettings: () => { permissionsService.openSettings(kind).catch(report(kind, 'open settings')); },
    });
    const all: Array<[boolean, Candidate]> = [
      [platform.canRecord, recording('microphone')],
      [platform.canCaptureSystemAudio, recording('system-audio')],
      [platform.hasNotifications, { id: 'notifications', access: notifications.access, request: notifications.request, openSettings: notifications.openSettings }],
      // Allowing calendar access also turns the calendar integration on (meeting names and reminders).
      [platform.hasCalendar, { id: 'calendar', access: calendar.access, request: () => calendar.setEnabled(true), openSettings: calendar.openSettings }],
    ];
    // Only what this platform has; a permission that can't exist here (notifications in a dev build) has no row.
    return all.flatMap(([supported, row]) => (supported && shown(row.access) ? [{ ...row, access: row.access }] : []));
  }, [recordingRows, request, notifications, calendar]);

  const requiredReady = rows.every((row) => !ONBOARDING_CONFIG.permissions.rows[row.id].required || row.access === 'ready');
  return { rows, requiredReady };
}
