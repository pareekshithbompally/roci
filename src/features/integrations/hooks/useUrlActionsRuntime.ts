/** Mount once (App): runs `roci://` links, signalling ready once settings and the menu bar listener exist. */

import { useEffect, useRef } from 'react';
import { isTauriEnvironment, menubarService } from '@services/tauri';
import { windowService } from '@services/window.service';
import { urlActionsService } from '@services/urlActions.service';
import { platform } from '@platform/index';
import type { UrlAction } from '@services/urlActions.service';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { fetchMeetingBrief } from '@shared/query/items';
import { useOpenMeeting } from '@features/history/hooks';
import { askInNewChat } from '@features/chat';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import type { HistoryItem } from '@shared/types';
import { failureLogger } from '@shared/utils/errors';

export interface UrlActionHandlers {
  show: () => Promise<void>;
  ask: (question: string) => void;
  findMeeting: (id: string) => Promise<HistoryItem | undefined>;
  openMeeting: (meeting: HistoryItem) => Promise<void>;
  notFound: () => void;
}

/** Run one link: bring Roci forward, then ask or open the meeting. */
export async function runUrlAction(action: UrlAction, handlers: UrlActionHandlers): Promise<void> {
  if (action.kind === 'ask') {
    await handlers.show();
    handlers.ask(action.value);
    return;
  }
  const meeting = await handlers.findMeeting(action.value);
  if (!meeting) {
    handlers.notFound();
    return;
  }
  await handlers.show();
  await handlers.openMeeting(meeting);
}

export function useUrlActionsRuntime(): void {
  const { isLoading: settingsLoading } = useSettings();
  const { showToast } = useToast();
  const openMeeting = useOpenMeeting();

  // Latest callbacks for the one listener, without re-subscribing.
  const latest: UrlActionHandlers = {
    show: () => windowService.show(),
    ask: askInNewChat,
    findMeeting: async (id) => (await fetchMeetingBrief(id)) ?? undefined,
    openMeeting,
    notFound: () => showToast(INTEGRATIONS_CONFIG.urlActions.meetingNotFound, 'error'),
  };
  const handlers = useRef(latest);
  handlers.current = latest;

  useEffect(() => {
    if (!platform.hasUrlActions || !isTauriEnvironment() || settingsLoading) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    const report = failureLogger('useUrlActionsRuntime');

    const start = async () => {
      const stop = await urlActionsService.onAction((action) => {
        runUrlAction(action, handlers.current).catch(report(`run ${action.kind}`));
      });
      if (cancelled) return stop();
      unlisten = stop;
      await menubarService.whenListening();
      if (!cancelled) await urlActionsService.ready();
    };
    start().catch(report('start'));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [settingsLoading]);
}
