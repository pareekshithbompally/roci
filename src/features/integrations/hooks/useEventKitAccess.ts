/**
 * useEventKitAccess — macOS access for one EventKit integration (calendars,
 * reminders) in the shared permission vocabulary. Re-read while the panel is
 * open so a grant in System Settings flips the row, like the recording checklist.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { PERMISSIONS_CONFIG } from '@config/permissions.config';
import { eventKitAccess } from '@features/integrations/utils/eventKitAccess';
import { openNative, type NativeTarget } from '@features/integrations/utils/openNative';
import type { CalendarAccessStatus } from '@services/calendar/types';
import type { IntegrationAccess } from '@features/integrations/types';

interface EventKitSource {
  id: 'calendar' | 'reminders';
  check: () => Promise<CalendarAccessStatus>;
  request: () => Promise<boolean>;
  /** The System Settings privacy pane for this kind of data. */
  settingsPane: NativeTarget;
}

export interface EventKitAccess {
  access: IntegrationAccess;
  /** Ask macOS; resolves whether access is now granted. */
  requestAccess: () => Promise<boolean>;
  openSettings: () => void;
}

export function useEventKitAccess({ id, check, request, settingsPane }: EventKitSource): EventKitAccess {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: queryKeys.integrationAccess(id),
    queryFn: check,
    enabled: isTauriEnvironment(),
    refetchInterval: PERMISSIONS_CONFIG.pollIntervalMs,
  });

  const requestAccess = useCallback(async () => {
    const granted = await request();
    await queryClient.invalidateQueries({ queryKey: queryKeys.integrationAccess(id) });
    return granted;
  }, [id, request, queryClient]);

  const openSettings = useCallback(() => {
    openNative(settingsPane).catch((error: unknown) =>
      console.error(`[useEventKitAccess] Opening ${id} settings failed:`, error));
  }, [id, settingsPane]);

  return { access: status ? eventKitAccess(status) : 'unknown', requestAccess, openSettings };
}
