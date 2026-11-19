/** Opens what the sidebar and ⌘K list: a meeting through its view (useOpenMeeting), a chat through openChat — the one
 *  way both do it, failures logged here so no caller leaves a rejection unhandled. */

import { useCallback } from 'react';
import { openChat } from '@features/chat';
import { useOpenMeeting } from './useOpenMeeting';
import type { UnifiedSidebarItem } from '@shared/types';

export function useOpenSession(): (item: UnifiedSidebarItem) => Promise<void> {
  const openMeeting = useOpenMeeting();
  return useCallback(async (item: UnifiedSidebarItem) => {
    try {
      if (item.type === 'chat') openChat(item.id);
      else if (item.historyItem) await openMeeting(item.historyItem);
    } catch (error: unknown) {
      console.error('[useOpenSession] Opening failed:', error);
    }
  }, [openMeeting]);
}
