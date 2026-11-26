/** Adds a to-do, to a meeting or of its own (`meetingId` null, the General group): the one save every new to-do goes
 *  through (To-dos, a meeting). Optimistic in the To-dos list; the meeting's own list refreshes once it is saved. */

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMeetingBrief } from '@shared/query/items';
import type { HistoryItem } from '@shared/types';
import { store, type GlobalTodoEntry } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { remindersSync } from '@services/reminders';
import { UNTITLED_MEETING } from '@config/meetingLive.config';

interface NewTodo {
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
  text: string;
  dueDate?: string;
}

export function useAddTodo(): (meetingId: string | null, text: string, dueDate?: string) => Promise<void> {
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: async ({ id, meetingId, text, dueDate }: NewTodo) => {
      await store.todos.upsert({ id, meetingId, text, dueDate, completed: false, source: 'user' });
    },
    onMutate: async ({ id, meetingId, meetingTitle, text, dueDate }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeGlobalTodos() });
      const previous = queryClient.getQueryData<GlobalTodoEntry[]>(queryKeys.storeGlobalTodos());
      const optimistic: GlobalTodoEntry = {
        id,
        text,
        dueDate,
        completed: false,
        source: 'user',
        createdAt: new Date().toISOString(),
        meetingId,
        meetingTitle,
        meetingCreatedAt: meetingId ? queryClient.getQueryData<HistoryItem | null>(queryKeys.meetingBrief(meetingId))?.timestamp ?? null : null,
      };
      queryClient.setQueryData<GlobalTodoEntry[]>(queryKeys.storeGlobalTodos(), (old) => [optimistic, ...(old || [])]);
      return { previous };
    },
    onError: (_error, _todo, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKeys.storeGlobalTodos(), context.previous);
    },
    onSuccess: (_data, { id }) => { void remindersSync.added([id]); },
    onSettled: (_data, _error, { meetingId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.storeGlobalTodos() });
      if (meetingId) void queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(meetingId) });
    },
  });

  return useCallback(async (meetingId, text, dueDate) => {
    const meetingTitle = meetingId ? (await fetchMeetingBrief(meetingId))?.title || UNTITLED_MEETING : null;
    await mutateAsync({ id: crypto.randomUUID(), meetingId, meetingTitle, text, dueDate });
  }, [mutateAsync]);
}
