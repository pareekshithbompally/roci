/** Opens what the sidebar and ⌘K list: a meeting through its view (useOpenMeeting), a chat through openChat. The one way both do it. */

import { useCallback } from 'react';
import { openChat } from '@features/chat';
import { useOpenMeeting } from './useOpenMeeting';
import type { UnifiedSidebarItem } from '@shared/types';

export function useOpenSession(): (item: UnifiedSidebarItem) => Promise<void> {
  const openMeeting = useOpenMeeting();
  return useCallback(async (item: UnifiedSidebarItem) => {
    if (item.type === 'chat') return openChat(item.id);
    if (item.historyItem) await openMeeting(item.historyItem);
  }, [openMeeting]);
}
