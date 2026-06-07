/**
 * useMeetingTodos Hook
 *
 * TanStack Query-based todos hook for a single meeting.
 * Provides optimistic mutations with rollback on failure.
 * Replaces MeetingContext todo state management.
 *
 * Preserves reminder side-effects:
 * - Cancel reminder when deleting a todo
 * - Cancel reminder when toggling a todo to completed
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { todosRepository } from '@services/repositories';
import { reminderService } from '@services/reminder.service';
import { queryKeys } from '@shared/query/queryKeys';
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
    queryKey: queryKeys.todos(meetingId!),
    queryFn: async (): Promise<MeetingTodosData> => {
      const entries = await todosRepository.readDoc(meetingId!);
      if (!entries || entries.length === 0) {
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
      const now = new Date().toISOString();
      const entry: TodoEntry = {
        id: crypto.randomUUID(),
        text,
        dueDate,
        completed: false,
        source: 'user',
        createdAt: now,
      };
      const ok = await todosRepository.addTodo(meetingId!, entry);
      if (!ok) throw new Error('Failed to save todo');
      return entry;
    },
    onMutate: async ({ text, dueDate }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos(meetingId!) });
      const previous = queryClient.getQueryData<MeetingTodosData>(queryKeys.todos(meetingId!));
      const optimistic: ActionItem = {
        id: crypto.randomUUID(),
        text,
        dueDate,
        completed: false,
      };
      queryClient.setQueryData<MeetingTodosData>(
        queryKeys.todos(meetingId!),
        (old) => ({
          userTodos: [optimistic, ...(old?.userTodos ?? [])],
          aiTodos: old?.aiTodos ?? [],
        })
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.todos(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos(meetingId!) });
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
      const ok = await todosRepository.updateTodo(meetingId!, todoId, updates);
      if (!ok) throw new Error('Failed to update todo');
    },
    onMutate: async ({ todoId, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos(meetingId!) });
      const previous = queryClient.getQueryData<MeetingTodosData>(queryKeys.todos(meetingId!));
      queryClient.setQueryData<MeetingTodosData>(queryKeys.todos(meetingId!), (old) => ({
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
        queryClient.setQueryData(queryKeys.todos(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos(meetingId!) });
    },
  });

  const deleteTodoMutate = useMutation({
    mutationFn: async (todoId: string) => {
      // Cancel any active reminder for this todo
      reminderService.cancel(todoId).catch((e) =>
        console.warn('[useMeetingTodos] Failed to cancel reminder on delete:', e)
      );
      const ok = await todosRepository.deleteTodo(meetingId!, todoId);
      if (!ok) throw new Error('Failed to delete todo');
    },
    onMutate: async (todoId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos(meetingId!) });
      const previous = queryClient.getQueryData<MeetingTodosData>(queryKeys.todos(meetingId!));
      queryClient.setQueryData<MeetingTodosData>(queryKeys.todos(meetingId!), (old) => ({
        userTodos: (old?.userTodos ?? []).filter((t) => t.id !== todoId),
        aiTodos: (old?.aiTodos ?? []).filter((t) => t.id !== todoId),
      }));
      return { previous };
    },
    onError: (_err, _todoId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.todos(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos(meetingId!) });
    },
  });

  const toggleTodoMutate = useMutation({
    mutationFn: async (todoId: string) => {
      const result = await todosRepository.toggleTodo(meetingId!, todoId);
      if (!result) throw new Error('Failed to toggle todo');
      // Cancel reminder when completing a todo
      if (result.completed) {
        reminderService.cancel(todoId).catch((e) =>
          console.warn('[useMeetingTodos] Failed to cancel reminder on complete:', e)
        );
      }
      return result;
    },
    onMutate: async (todoId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos(meetingId!) });
      const previous = queryClient.getQueryData<MeetingTodosData>(queryKeys.todos(meetingId!));
      queryClient.setQueryData<MeetingTodosData>(queryKeys.todos(meetingId!), (old) => {
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
        queryClient.setQueryData(queryKeys.todos(meetingId!), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos(meetingId!) });
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
