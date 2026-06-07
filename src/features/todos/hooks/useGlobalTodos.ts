/**
 * useGlobalTodos Hook
 *
 * Aggregates todos from ALL meetings into a single list.
 * Backed by TanStack Query — one disk read per open, mutations with invalidation.
 * Supports search, create, toggle, and reminder management.
 *
 * Mutations invalidate both queryKeys.globalTodos() and queryKeys.todos(meetingId),
 * ensuring the main meeting view and RemindersView stay in sync without window events.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { todosRepository } from '@services/repositories';
import { reminderService } from '@services/reminder.service';
import { queryKeys } from '@shared/query/queryKeys';
import type { ScheduleReminderParams } from '@services/reminder.service';
import type { TodoEntry, HistoryItem } from '@shared/types';
import { hashToNotificationId } from '@shared/utils/todo.utils';

export interface GlobalTodo extends TodoEntry {
  meetingId: string;
  meetingTitle: string;
}

export type TodoFilter = 'all' | 'pending' | 'completed';

interface MeetingGroup {
  meetingId: string;
  meetingTitle: string;
  timestamp: number;
  todos: GlobalTodo[];
}

export interface UseGlobalTodosReturn {
  /** Flat list of all todos (filtered) */
  todos: GlobalTodo[];
  /** Todos grouped by meeting */
  groups: MeetingGroup[];
  /** Active filter */
  filter: TodoFilter;
  /** Set the filter */
  setFilter: (f: TodoFilter) => void;
  /** Search query */
  searchQuery: string;
  /** Set the search query */
  setSearchQuery: (q: string) => void;
  /** Toggle a todo's completion and persist */
  toggleTodo: (meetingId: string, todoId: string) => Promise<void>;
  /** Create a new todo linked to a meeting */
  addTodo: (meetingId: string, text: string, dueDate?: string) => Promise<void>;
  /** Set or clear a reminder on a todo */
  setReminder: (meetingId: string, todoId: string, todoText: string, meetingTitle: string, dateTime: string | null) => Promise<void>;
  /** Counts (based on search-filtered set, before filter tabs) */
  counts: { total: number; pending: number; completed: number };
  /** Loading state */
  isLoading: boolean;
  /** Reload all data */
  refresh: () => Promise<void>;
}

/** Tokenize a query and check if all tokens match the target string */
const matchesSearch = (target: string, tokens: string[]): boolean => {
  const lower = target.toLowerCase();
  return tokens.every(t => lower.includes(t));
};

export function useGlobalTodos(): UseGlobalTodosReturn {
  const { items: historyItems } = useHistoryData();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const historyLen = historyItems.length;

  // Refetch the aggregate when the meeting list changes (added/removed meetings).
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.globalTodos() });
  }, [historyLen, queryClient]);

  const {
    data: allTodos = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.globalTodos(),
    queryFn: async (): Promise<GlobalTodo[]> => {
      const results: GlobalTodo[] = [];

      if (historyItems.length > 0) {
        const entries = await Promise.all(
          historyItems.map(async (hi: HistoryItem) => {
            try {
              const todos = await todosRepository.readDoc(hi.id);
              return { hi, todos: todos || [] };
            } catch {
              return { hi, todos: [] };
            }
          })
        );

        for (const { hi, todos } of entries) {
          for (const todo of todos) {
            results.push({
              ...todo,
              meetingId: hi.id,
              meetingTitle: hi.title || 'Untitled Meeting',
            });
          }
        }
      }

      // Also load general (non-meeting) todos
      try {
        const generalTodos = await todosRepository.readDoc('_general');
        if (generalTodos) {
          for (const todo of generalTodos) {
            results.push({
              ...todo,
              meetingId: '_general',
              meetingTitle: 'General',
            });
          }
        }
      } catch {
        // _general may not exist yet
      }

      return results;
    },
  });

  const toggleTodoMutate = useMutation({
    mutationFn: async ({ meetingId, todoId }: { meetingId: string; todoId: string }) => {
      await todosRepository.toggleTodo(meetingId, todoId);
    },
    onMutate: async ({ meetingId, todoId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.globalTodos() });
      const previous = queryClient.getQueryData<GlobalTodo[]>(queryKeys.globalTodos());
      queryClient.setQueryData<GlobalTodo[]>(queryKeys.globalTodos(), (old) =>
        (old || []).map((t) =>
          t.id === todoId && t.meetingId === meetingId
            ? { ...t, completed: !t.completed }
            : t
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.globalTodos(), context.previous);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.globalTodos() });
      if (variables?.meetingId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.todos(variables.meetingId) });
      }
    },
  });

  const addTodoMutate = useMutation({
    mutationFn: async ({
      meetingId,
      text,
      dueDate,
      meetingTitle,
    }: {
      meetingId: string;
      text: string;
      dueDate?: string;
      meetingTitle: string;
    }) => {
      const todoEntry: TodoEntry = {
        id: crypto.randomUUID(),
        text,
        dueDate,
        completed: false,
        source: 'user',
        createdAt: new Date().toISOString(),
      };
      const ok = await todosRepository.addTodo(meetingId, todoEntry);
      if (!ok) throw new Error('Failed to add todo');
      return { ...todoEntry, meetingId, meetingTitle };
    },
    onMutate: async ({ meetingId, text, dueDate, meetingTitle }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.globalTodos() });
      const previous = queryClient.getQueryData<GlobalTodo[]>(queryKeys.globalTodos());
      const optimistic: GlobalTodo = {
        id: crypto.randomUUID(),
        text,
        dueDate,
        completed: false,
        source: 'user',
        createdAt: new Date().toISOString(),
        meetingId,
        meetingTitle,
      };
      queryClient.setQueryData<GlobalTodo[]>(queryKeys.globalTodos(), (old) =>
        [optimistic, ...(old || [])]
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.globalTodos(), context.previous);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.globalTodos() });
      if (variables?.meetingId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.todos(variables.meetingId) });
      }
    },
  });

  const setReminderMutate = useMutation({
    mutationFn: async ({
      meetingId,
      todoId,
      todoText,
      meetingTitle,
      dateTime,
    }: {
      meetingId: string;
      todoId: string;
      todoText: string;
      meetingTitle: string;
      dateTime: string | null;
    }) => {
      if (dateTime) {
        const params: ScheduleReminderParams = {
          todoId,
          meetingId,
          todoText: todoText.length > 80 ? todoText.slice(0, 77) + '…' : todoText,
          meetingTitle,
          reminderDateTime: dateTime,
        };
        await reminderService.schedule(params);
      } else {
        await reminderService.cancel(todoId);
      }
    },
    onMutate: async ({ meetingId, todoId, dateTime }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.globalTodos() });
      const previous = queryClient.getQueryData<GlobalTodo[]>(queryKeys.globalTodos());
      queryClient.setQueryData<GlobalTodo[]>(queryKeys.globalTodos(), (old) =>
        (old || []).map((t) =>
          t.id === todoId && t.meetingId === meetingId
            ? {
                ...t,
                reminder: dateTime
                  ? { dateTime, notificationId: hashToNotificationId(todoId) }
                  : undefined,
              }
            : t
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.globalTodos(), context.previous);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.globalTodos() });
      if (variables?.meetingId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.todos(variables.meetingId) });
      }
    },
  });

  const toggleTodo = useCallback(
    async (meetingId: string, todoId: string) => {
      await toggleTodoMutate.mutateAsync({ meetingId, todoId });
    },
    [toggleTodoMutate]
  );

  const addTodo = useCallback(
    async (meetingId: string, text: string, dueDate?: string) => {
      const hi = historyItems.find((h) => h.id === meetingId);
      const meetingTitle = hi?.title || 'Untitled Meeting';
      await addTodoMutate.mutateAsync({ meetingId, text, dueDate, meetingTitle });
    },
    [historyItems, addTodoMutate]
  );

  const setReminder = useCallback(
    async (
      meetingId: string,
      todoId: string,
      todoText: string,
      meetingTitle: string,
      dateTime: string | null
    ) => {
      await setReminderMutate.mutateAsync({
        meetingId,
        todoId,
        todoText,
        meetingTitle,
        dateTime,
      });
    },
    [setReminderMutate]
  );

  // Search-filtered set (before tab filters)
  const searchTokens = useMemo(
    () => searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [searchQuery]
  );

  const searchFiltered = useMemo(() => {
    if (searchTokens.length === 0) return allTodos;
    return allTodos.filter((t) =>
      matchesSearch(t.text, searchTokens) ||
      matchesSearch(t.meetingTitle, searchTokens) ||
      (t.owner && matchesSearch(t.owner, searchTokens))
    );
  }, [allTodos, searchTokens]);

  // Counts are based on search-filtered set so tabs reflect visible data
  const counts = useMemo(() => {
    const total = searchFiltered.length;
    const pending = searchFiltered.filter((t) => !t.completed).length;
    const completed = searchFiltered.filter((t) => t.completed).length;
    return { total, pending, completed };
  }, [searchFiltered]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'pending':
        return searchFiltered.filter((t) => !t.completed);
      case 'completed':
        return searchFiltered.filter((t) => t.completed);
      default:
        return searchFiltered;
    }
  }, [searchFiltered, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, MeetingGroup>();
    for (const todo of filtered) {
      let group = map.get(todo.meetingId);
      if (!group) {
        const hi = historyItems.find((h) => h.id === todo.meetingId);
        group = {
          meetingId: todo.meetingId,
          meetingTitle: todo.meetingTitle,
          timestamp: hi?.timestamp ?? new Date(todo.createdAt).getTime(),
          todos: [],
        };
        map.set(todo.meetingId, group);
      }
      group.todos.push(todo);
    }

    return Array.from(map.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((g) => ({
        ...g,
        todos: g.todos.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return 0;
        }),
      }));
  }, [filtered, historyItems]);

  return {
    todos: filtered,
    groups,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    toggleTodo,
    addTodo,
    setReminder,
    counts,
    isLoading,
    refresh: async () => { await refetch(); },
  };
}
