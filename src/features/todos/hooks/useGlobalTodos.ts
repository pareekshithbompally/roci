/**
 * useGlobalTodos Hook
 *
 * Aggregates todos from ALL meetings into a single list.
 * Reads from todosRepository for each known meeting, provides
 * toggle/complete that persists to disk, and groups by meeting.
 * Supports search, create, and reminder management.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { todosRepository } from '@/services/repositories';
import { reminderService } from '@/services/reminder.service';
import type { ScheduleReminderParams } from '@/services/reminder.service';
import type { TodoEntry, HistoryItem } from '@/types';

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
  const [allTodos, setAllTodos] = useState<GlobalTodo[]>([]);
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const results: GlobalTodo[] = [];

      // Load todos from each meeting in parallel
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

      setAllTodos(results);
    } catch (error: unknown) {
      console.error('[useGlobalTodos] Failed to load todos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [historyItems]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Refresh when chat creates/modifies a todo
  useEffect(() => {
    const handler = () => { loadAll(); };
    window.addEventListener('kasset:todo-mutation', handler);
    return () => window.removeEventListener('kasset:todo-mutation', handler);
  }, [loadAll]);

  // Search-filtered set (before tab filters) — search across text, meeting title, owner
  const searchTokens = useMemo(
    () => searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [searchQuery]
  );

  const searchFiltered = useMemo(() => {
    if (searchTokens.length === 0) return allTodos;
    return allTodos.filter(t =>
      matchesSearch(t.text, searchTokens) ||
      matchesSearch(t.meetingTitle, searchTokens) ||
      (t.owner && matchesSearch(t.owner, searchTokens))
    );
  }, [allTodos, searchTokens]);

  // Counts are based on search-filtered set so tabs reflect visible data
  const counts = useMemo(() => {
    const total = searchFiltered.length;
    const pending = searchFiltered.filter(t => !t.completed).length;
    const completed = searchFiltered.filter(t => t.completed).length;
    return { total, pending, completed };
  }, [searchFiltered]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'pending':
        return searchFiltered.filter(t => !t.completed);
      case 'completed':
        return searchFiltered.filter(t => t.completed);
      default:
        return searchFiltered;
    }
  }, [searchFiltered, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, MeetingGroup>();
    for (const todo of filtered) {
      let group = map.get(todo.meetingId);
      if (!group) {
        const hi = historyItems.find(h => h.id === todo.meetingId);
        group = {
          meetingId: todo.meetingId,
          meetingTitle: todo.meetingTitle,
          timestamp: hi?.timestamp || 0,
          todos: [],
        };
        map.set(todo.meetingId, group);
      }
      group.todos.push(todo);
    }

    // Sort groups by meeting date (newest first), todos within: pending first
    return Array.from(map.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(g => ({
        ...g,
        todos: g.todos.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return 0;
        }),
      }));
  }, [filtered, historyItems]);

  const toggleTodo = useCallback(async (meetingId: string, todoId: string) => {
    // Optimistic update
    setAllTodos(prev =>
      prev.map(t =>
        t.id === todoId && t.meetingId === meetingId
          ? { ...t, completed: !t.completed }
          : t
      )
    );

    try {
      await todosRepository.toggleTodo(meetingId, todoId);
    } catch (error: unknown) {
      console.error('[useGlobalTodos] Toggle failed, reverting:', error);
      // Revert on failure
      setAllTodos(prev =>
        prev.map(t =>
          t.id === todoId && t.meetingId === meetingId
            ? { ...t, completed: !t.completed }
            : t
        )
      );
    }
  }, []);

  const addTodo = useCallback(async (meetingId: string, text: string, dueDate?: string) => {
    const hi = historyItems.find(h => h.id === meetingId);
    const meetingTitle = hi?.title || 'Untitled Meeting';

    const todoEntry: TodoEntry = {
      id: crypto.randomUUID(),
      text,
      dueDate,
      completed: false,
      source: 'user',
      createdAt: new Date().toISOString(),
    };

    // Optimistic update
    setAllTodos(prev => [{
      ...todoEntry,
      meetingId,
      meetingTitle,
    }, ...prev]);

    try {
      await todosRepository.addTodo(meetingId, todoEntry);
    } catch (error: unknown) {
      console.error('[useGlobalTodos] addTodo failed, reverting:', error);
      setAllTodos(prev => prev.filter(t => t.id !== todoEntry.id));
    }
  }, [historyItems]);

  const setReminder = useCallback(async (
    meetingId: string,
    todoId: string,
    todoText: string,
    meetingTitle: string,
    dateTime: string | null,
  ) => {
    try {
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
      // Update local state
      setAllTodos(prev =>
        prev.map(t =>
          t.id === todoId && t.meetingId === meetingId
            ? { ...t, reminder: dateTime ? { dateTime } : undefined }
            : t
        )
      );
    } catch (error: unknown) {
      console.error('[useGlobalTodos] setReminder failed:', error);
    }
  }, []);

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
    refresh: loadAll,
  };
}
