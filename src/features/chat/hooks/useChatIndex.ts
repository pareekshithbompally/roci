/** The chat list (titles and dates, no messages): disk state, owned by Query; the chat store edits it optimistically. */

import { useQuery } from '@tanstack/react-query';
import type { ChatIndexEntry } from '@shared/types';
import { chatService } from '@services/chat.service';
import { queryKeys } from '@shared/query/queryKeys';

const NO_CHATS: ChatIndexEntry[] = [];

export function useChatIndex(): ChatIndexEntry[] {
  const { data } = useQuery({ queryKey: queryKeys.chats(), queryFn: () => chatService.listSessions() });
  return data ?? NO_CHATS;
}
