/** All meetings' todos in one query; mutations invalidate both global and per-meeting todo keys. */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { store, type GlobalTodoEntry } from '@services/db';
import { reminderService } from '@services/reminder.service';
import { queryKeys } from '@shared/query/queryKeys';
import { remindersSync } from '@services/reminders';

export type TodoFilter = 'all' | 'pending' | 'completed';

interface MeetingGroup {
  /** Null for the group of to-dos without a meeting. */
  meetingId: string | null;
  meetingTitle: string | null;
  timestamp: number;
  todos: GlobalTodoEntry[];
}

export interface UseGlobalTodosReturn {
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
  toggleTodo: (meetingId: string | null, todoId: string) => Promise<void>;
  /** Counts (based on search-filtered set, before filter tabs) */
  counts: { total: number; pending: number; completed: number };
  /** Loading state */
  isLoading: boolean;
  /** Reads every to-do list again */
  refresh: () => void;
}

/** Tokenize a query and check if all tokens match the target string */
const matchesSearch = (target: string, tokens: string[]): boolean => {
  const lower = target.toLowerCase();
  return tokens.every(t => lower.includes(t));
};

export function useGlobalTodos(): UseGlobalTodosReturn {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');


  const {
    data: allTodos = [],
    isLoading,
  } = useQuery({
    queryKey: queryKeys.storeGlobalTodos(),
    queryFn: async (): Promise<GlobalTodoEntry[]> => {
      const result = await store.todos.listGlobal(undefined, 500, 0);
      return result.items;
    },
  });

  const toggleTodoMutate = useMutation({
    mutationFn: async ({ meetingId, todoId }: { meetingId: string | null; todoId: string }) => {
      const todo = allTodos.find((t) => t.id === todoId);
      if (!todo) throw new Error('Todo not found');
      const newCompleted = !todo.completed;
      await store.todos.setCompleted(todoId, newCompleted);
      if (newCompleted) {
        await reminderService.cancel(todoId);
      }
    },
    onMutate: async ({ meetingId, todoId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeGlobalTodos() });
      const previous = queryClient.getQueryData<GlobalTodoEntry[]>(queryKeys.storeGlobalTodos());
      queryClient.setQueryData<GlobalTodoEntry[]>(queryKeys.storeGlobalTodos(), (old) =>
        (old || []).map((t) =>
          t.id === todoId && t.meetingId === meetingId
            ? { ...t, completed: !t.completed, reminder: !t.completed ? t.reminder : undefined }
            : t
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.storeGlobalTodos(), context.previous);
      }
    },
    onSuccess: (_data, { todoId }) => { void remindersSync.changed(todoId); },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storeGlobalTodos() });
      if (variables?.meetingId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.storeTodos(variables.meetingId) });
      }
    },
  });

  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: queryKeys.storeTodosAll() }), [queryClient]);

  const toggleTodo = useCallback(
    async (meetingId: string | null, todoId: string) => {
      await toggleTodoMutate.mutateAsync({ meetingId, todoId });
    },
    [toggleTodoMutate]
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
      (t.meetingTitle && matchesSearch(t.meetingTitle, searchTokens)) ||
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
    const map = new Map<string | null, MeetingGroup>();
    for (const todo of filtered) {
      let group = map.get(todo.meetingId);
      if (!group) {
        // To-dos of their own lead the list; meetings follow, newest first.
        const ts = todo.meetingId ? todo.meetingCreatedAt ?? 0 : Number.MAX_SAFE_INTEGER;
        group = {
          meetingId: todo.meetingId,
          meetingTitle: todo.meetingTitle,
          timestamp: ts,
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
  }, [filtered]);

  return {
    groups,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    toggleTodo,
    counts,
    isLoading,
    refresh,
  };
}
