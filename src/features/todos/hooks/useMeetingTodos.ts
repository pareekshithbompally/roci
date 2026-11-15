/** One meeting's todos with optimistic mutations; deleting or completing a todo cancels its reminder. */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { remindersSync } from '@services/reminders';
import type { TodoEntry, ActionItem } from '@shared/types';

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

interface MeetingTodosData {
  userTodos: ActionItem[];
  aiTodos: ActionItem[];
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

  const addTodoMutate = useMutation({
    mutationFn: async ({ text, dueDate }: { text: string; dueDate?: string }) => {
      const entry = {
        id: crypto.randomUUID(),
        meetingId: meetingId!,
        text,
        dueDate,
        completed: false,
        source: 'user' as const,
      };
      await store.todos.upsert(entry);
      return entry;
    },
    onMutate: async ({ text, dueDate }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeTodos(meetingId!) });
      const previous = queryClient.getQueryData<MeetingTodosData>(queryKeys.storeTodos(meetingId!));
      const optimistic: ActionItem = {
        id: crypto.randomUUID(),
        text,
        dueDate,
        completed: false,
      };
      queryClient.setQueryData<MeetingTodosData>(
        queryKeys.storeTodos(meetingId!),
        (old) => ({
          userTodos: [optimistic, ...(old?.userTodos ?? [])],
          aiTodos: old?.aiTodos ?? [],
        })
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.storeTodos(meetingId!), context.previous);
      }
    },
    onSuccess: (entry) => { void remindersSync.added(entry.meetingId, [entry.id]); },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(meetingId!) });
    },
  });

  const updateTodoMutate = useMutation({
    mutationFn: async ({
      todoId,
      updates,
    }: {
      todoId: string;
      updates: { text?: string; dueDate?: string };
    }) => {
      await store.todos.upsert({
        id: todoId,
        meetingId: meetingId!,
        text: updates.text ?? '',
        dueDate: updates.dueDate,
      });
    },
    onMutate: async ({ todoId, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeTodos(meetingId!) });
      const previous = queryClient.getQueryData<MeetingTodosData>(queryKeys.storeTodos(meetingId!));
      queryClient.setQueryData<MeetingTodosData>(queryKeys.storeTodos(meetingId!), (old) => ({
        userTodos: (old?.userTodos ?? []).map((t) =>
          t.id === todoId ? { ...t, ...updates } : t
        ),
        aiTodos: (old?.aiTodos ?? []).map((t) =>
          t.id === todoId ? { ...t, ...updates } : t
        ),
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.storeTodos(meetingId!), context.previous);
      }
    },
    onSuccess: (_data, { todoId }) => { void remindersSync.changed(meetingId!, todoId); },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(meetingId!) });
    },
  });

  const deleteTodoMutate = useMutation({
    mutationFn: async (todoId: string) => {
      try {
        await store.reminders.setStatus(todoId, 'cancelled');
      } catch {
        // reminder may not exist
      }
      await store.todos.delete(todoId);
    },
    onMutate: async (todoId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeTodos(meetingId!) });
      const previous = queryClient.getQueryData<MeetingTodosData>(queryKeys.storeTodos(meetingId!));
      queryClient.setQueryData<MeetingTodosData>(queryKeys.storeTodos(meetingId!), (old) => ({
        userTodos: (old?.userTodos ?? []).filter((t) => t.id !== todoId),
        aiTodos: (old?.aiTodos ?? []).filter((t) => t.id !== todoId),
      }));
      return { previous };
    },
    onError: (_err, _todoId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.storeTodos(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(meetingId!) });
    },
  });

  const toggleTodoMutate = useMutation({
    mutationFn: async (todoId: string) => {
      const entries = await store.todos.listForMeeting(meetingId!);
      const todo = entries.find((t) => t.id === todoId);
      if (!todo) throw new Error('Todo not found');
      const newCompleted = !todo.completed;
      await store.todos.setCompleted(todoId, newCompleted);
      if (newCompleted) {
        try {
          await store.reminders.setStatus(todoId, 'cancelled');
        } catch {
          // reminder may not exist
        }
      }
      return { completed: newCompleted };
    },
    onMutate: async (todoId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeTodos(meetingId!) });
      const previous = queryClient.getQueryData<MeetingTodosData>(queryKeys.storeTodos(meetingId!));
      queryClient.setQueryData<MeetingTodosData>(queryKeys.storeTodos(meetingId!), (old) => {
        const updateArr = (arr: ActionItem[]) =>
          arr.map((t) =>
            t.id === todoId
              ? { ...t, completed: !t.completed, reminder: !t.completed ? t.reminder : undefined }
              : t
          );
        return {
          userTodos: updateArr(old?.userTodos ?? []),
          aiTodos: updateArr(old?.aiTodos ?? []),
        };
      });
      return { previous };
    },
    onError: (_err, _todoId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.storeTodos(meetingId!), context.previous);
      }
    },
    onSuccess: (_data, todoId) => { void remindersSync.changed(meetingId!, todoId); },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(meetingId!) });
    },
  });

  const addTodo = useCallback(
    async (text: string, dueDate?: string) => {
      if (!meetingId) return;
      await addTodoMutate.mutateAsync({ text, dueDate });
    },
    [meetingId, addTodoMutate]
  );

  const updateTodo = useCallback(
    async (todoId: string, updates: { text?: string; dueDate?: string }) => {
      if (!meetingId) return;
      await updateTodoMutate.mutateAsync({ todoId, updates });
    },
    [meetingId, updateTodoMutate]
  );

  const deleteTodo = useCallback(
    async (todoId: string) => {
      if (!meetingId) return;
      await deleteTodoMutate.mutateAsync(todoId);
    },
    [meetingId, deleteTodoMutate]
  );

  const toggleTodo = useCallback(
    async (todoId: string) => {
      if (!meetingId) return;
      await toggleTodoMutate.mutateAsync(todoId);
    },
    [meetingId, toggleTodoMutate]
  );

  return {
    userTodos,
    aiTodos,
    isLoading,
    error: queryError,
    meetingId,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
  };
}
