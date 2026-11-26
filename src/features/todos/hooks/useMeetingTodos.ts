/** One meeting's to-dos, read from disk; changes go through each row (`useTodoActions`). */

import { useQuery } from '@tanstack/react-query';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import type { TodoEntry, ActionItem } from '@shared/types';
import type { MeetingTodosData } from './useTodoActions';

function mapEntryToActionItem(entry: TodoEntry): ActionItem {
  return {
    id: entry.id,
    text: entry.text,
    owner: entry.owner,
    dueDate: entry.dueDate,
    completed: entry.completed,
    reminder: entry.reminder,
  };
}

export function useMeetingTodos(meetingId: string | null) {

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.storeTodos(meetingId!),
    queryFn: async (): Promise<MeetingTodosData> => {
      const entries = await store.todos.listForMeeting(meetingId!);
      if (entries.length === 0) {
        return { userTodos: [], aiTodos: [] };
      }
      const aiEntries = entries.filter((t) => t.source === 'ai');
      const userEntries = entries.filter((t) => t.source !== 'ai');
      return {
        userTodos: userEntries.map(mapEntryToActionItem),
        aiTodos: aiEntries.map(mapEntryToActionItem),
      };
    },
    enabled: !!meetingId,
  });

  const userTodos = data?.userTodos ?? [];
  const aiTodos = data?.aiTodos ?? [];
  const queryError = error ? (error instanceof Error ? error.message : 'Failed to load todos') : null;

  return {
    userTodos,
    aiTodos,
    isLoading,
    error: queryError,
    meetingId,
  };
}
