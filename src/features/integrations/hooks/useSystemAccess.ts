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
  /** Ask the system; resolves whether access is now granted (never rejects). One it won't ask about opens Settings. */
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

  const openSettings = useCallback(() => {
    openSettingsPane(settingsPane).catch((error: unknown) =>
      console.error(`[useSystemAccess] Opening ${id} settings failed:`, error));
  }, [id, settingsPane]);

  const requestAccess = useCallback(async () => {
    const report = (action: string) => (error: unknown) => console.error(`[useSystemAccess] ${id} ${action} failed:`, error);
    const granted = await request().catch((error: unknown) => {
      report('request')(error);
      return false;
    });
    // The system's answer is the truth (the bridge keeps a grant for the run); a check started before it answered
    // (focus returns when the prompt closes) is cancelled before the answer is written.
    const key = queryKeys.integrationAccess(id);
    await queryClient.cancelQueries({ queryKey: key });
    if (granted) {
      queryClient.setQueryData<CalendarAccessStatus>(key, 'authorized');
      return true;
    }
    const answer = await queryClient.fetchQuery({ queryKey: key, queryFn: check, staleTime: 0 }).catch(report('check'));
    if (answer === 'not_determined') openSettings();
    return false;
  }, [id, request, check, openSettings, queryClient]);

  const access: IntegrationAccess = status === 'unavailable' ? 'unavailable' : status ? eventKitAccess(status) : 'unknown';
  return { access, requestAccess, openSettings };
}
