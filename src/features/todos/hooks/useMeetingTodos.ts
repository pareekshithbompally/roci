/** One meeting's to-dos, read from disk; its changes go through `useTodoActions` like every to-do's. */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import type { TodoEntry, ActionItem } from '@shared/types';
import { useTodoActions, type MeetingTodosData } from './useTodoActions';

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
  const queryClient = useQueryClient();

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

  const actions = useTodoActions();
  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: queryKeys.storeTodosAll() }), [queryClient]);
  const toggleTodo = useCallback(async (todoId: string) => {
    const todo = [...userTodos, ...aiTodos].find((t) => t.id === todoId);
    if (todo) await actions.setDone(todoId, !todo.completed);
  }, [userTodos, aiTodos, actions]);

  return {
    userTodos,
    aiTodos,
    isLoading,
    error: queryError,
    meetingId,
    updateTodo: (todoId: string, updates: { text?: string; dueDate?: string }) => actions.edit(todoId, updates),
    deleteTodo: actions.remove,
    toggleTodo,
    refresh,
  };
}
