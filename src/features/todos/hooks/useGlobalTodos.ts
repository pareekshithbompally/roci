/** All meetings' to-dos in one query, grouped and filtered; changes go through `useTodoActions` like every to-do's. */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { store, type GlobalTodoEntry } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { useTodoActions } from './useTodoActions';

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
  toggleTodo: (todoId: string) => Promise<void>;
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

  const actions = useTodoActions();

  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: queryKeys.storeTodosAll() }), [queryClient]);

  const toggleTodo = useCallback(async (todoId: string) => {
    const todo = allTodos.find((t) => t.id === todoId);
    if (todo) await actions.setDone(todoId, !todo.completed);
  }, [allTodos, actions]);

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
