/** Show one meeting on home; the sidebar, search and `kasset://meeting/<id>` all open meetings through this. */

import { useCallback } from 'react';
import { useAppActions } from '@shared/stores/appStore';
import { useChat } from '@shared/contexts/ChatContext';
import { AppStatus } from '@shared/types';
import type { HistoryItem } from '@shared/types';
import { useMeetingDetailLoader } from './useMeetingDetailLoader';

export function useOpenMeeting(): (meeting: HistoryItem) => Promise<void> {
  const { setCurrentView, setSelectedHistoryId, setStatus } = useAppActions();
  const { setCurrentSessionId } = useChat();
  const loadMeetingDetail = useMeetingDetailLoader();

  return useCallback(async (meeting: HistoryItem) => {
    setCurrentView('home');
    setSelectedHistoryId(meeting.id);
    setCurrentSessionId(null);
    // Generation-guarded lazy load (newest selection wins).
    await loadMeetingDetail(meeting);
    setStatus(AppStatus.RESULTS);
  }, [setCurrentView, setSelectedHistoryId, setStatus, setCurrentSessionId, loadMeetingDetail]);
}
