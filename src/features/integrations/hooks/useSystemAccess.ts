/** System access for one integration, re-read after a request and whenever Roci regains focus, so a grant made in Settings shows. */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import { eventKitAccess } from '@features/integrations/utils/eventKitAccess';
import { openSettingsPane, type NativeTarget } from '@features/integrations/utils/openNative';
import type { CalendarAccessStatus } from '@services/calendar/types';
import type { IntegrationAccess } from '@features/integrations/types';
import type { AccessId } from '@shared/query/queryKeys';

interface AccessSource {
  id: AccessId;
  /** `unavailable`: the permission can't exist here (e.g. notifications in a dev build). */
  check: () => Promise<CalendarAccessStatus | 'unavailable'>;
  request: () => Promise<boolean>;
  /** The macOS System Settings privacy pane for this kind of data (iOS opens Roci's own Settings page instead). */
  settingsPane: NativeTarget;
}

export interface SystemAccess {
  access: IntegrationAccess;
  /** Ask the system; resolves whether access is now granted. */
  requestAccess: () => Promise<boolean>;
  openSettings: () => void;
}

export function useSystemAccess({ id, check, request, settingsPane }: AccessSource): SystemAccess {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: queryKeys.integrationAccess(id),
    queryFn: check,
    enabled: isTauriEnvironment(),
    refetchOnWindowFocus: 'always',
  });

  const requestAccess = useCallback(async () => {
    const granted = await request();
    await queryClient.invalidateQueries({ queryKey: queryKeys.integrationAccess(id) });
    return granted;
  }, [id, request, queryClient]);

  const openSettings = useCallback(() => {
    openSettingsPane(settingsPane).catch((error: unknown) =>
      console.error(`[useSystemAccess] Opening ${id} settings failed:`, error));
  }, [id, settingsPane]);

  const access: IntegrationAccess = status === 'unavailable' ? 'unavailable' : status ? eventKitAccess(status) : 'unknown';
  return { access, requestAccess, openSettings };
}
