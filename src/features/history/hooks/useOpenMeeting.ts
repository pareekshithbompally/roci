/** Show one meeting on home; the sidebar, search and `roci://meeting/<id>` all open meetings through this. */

import { useCallback } from 'react';
import { useAppActions } from '@shared/stores/appStore';
import { useChatStore } from '@features/chat';
import { AppStatus } from '@shared/types';
import type { HistoryItem } from '@shared/types';

export function useOpenMeeting(): (meeting: HistoryItem) => Promise<void> {
  const { setCurrentView, setSelectedHistoryId, setStatus } = useAppActions();
  const setCurrentSessionId = useChatStore((s) => s.setCurrentSessionId);

  // the view reads the meeting itself (useMeetingResult); opening it is only choosing it
  return useCallback(async (meeting: HistoryItem) => {
    setCurrentView('home');
    setSelectedHistoryId(meeting.id);
    setCurrentSessionId(null);
    setStatus(AppStatus.RESULTS);
  }, [setCurrentView, setSelectedHistoryId, setStatus, setCurrentSessionId]);
}
