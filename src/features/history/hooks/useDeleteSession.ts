/** The one delete path for sidebar sessions (meetings and chats): confirm, leave it if open, delete, report. */

import { useCallback } from 'react';
import { useMeetingMutations } from '@shared/hooks/useMeetings';
import { useAppStore } from '@shared/stores/appStore';
import { useChatStore, startNewChat } from '@features/chat';
import { useToast } from '@shared/contexts/ToastContext';
import { confirmDelete } from '@shared/stores/confirmStore';
import type { UnifiedSidebarItem } from '@shared/types';

const NOUN = { meeting: 'meeting', chat: 'chat' } as const;

type SessionRef = Pick<UnifiedSidebarItem, 'type' | 'id'>;

export function useDeleteSession(): (session: SessionRef) => Promise<void> {
  const { deleteMeeting: deleteItem } = useMeetingMutations();
  const deleteSession = useChatStore((s) => s.deleteSession);
  const { showToast } = useToast();

  const deleteChat = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await deleteSession(id);
        return true;
      } catch (error: unknown) {
        console.error('[useDeleteSession] Failed to delete chat:', error);
        return false;
      }
    },
    [deleteSession],
  );

  return useCallback(
    async ({ type, id }: SessionRef) => {
      const noun = NOUN[type];
      if (!(await confirmDelete(noun))) return;
      // Leave before the optimistic removal, so the open meeting never renders without its list entry.
      if (type === 'meeting' && useAppStore.getState().selectedHistoryId === id) startNewChat();

      const deleted = type === 'meeting' ? await deleteItem(id) : await deleteChat(id);
      if (!deleted) showToast(`Couldn't delete ${noun}`, 'error');
    },
    [deleteItem, deleteChat, showToast],
  );
}
