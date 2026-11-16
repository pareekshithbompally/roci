/** The one delete path for sidebar sessions (meetings and chats): confirm, delete, report. */

import { useCallback } from 'react';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useChatStore } from '@features/chat';
import { useToast } from '@shared/contexts/ToastContext';
import { confirmDelete } from '@shared/stores/confirmStore';
import type { UnifiedSidebarItem } from '@shared/types';

const NOUN = { meeting: 'meeting', chat: 'chat' } as const;

type SessionRef = Pick<UnifiedSidebarItem, 'type' | 'id'>;

export function useDeleteSession(): (session: SessionRef) => Promise<void> {
  const { deleteItem } = useHistoryData();
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

      const deleted = type === 'meeting' ? await deleteItem(id) : await deleteChat(id);
      if (!deleted) showToast(`Couldn't delete ${noun}`, 'error');
    },
    [deleteItem, deleteChat, showToast],
  );
}
