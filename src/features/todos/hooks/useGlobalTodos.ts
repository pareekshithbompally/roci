/** Every to-do (each meeting's and those of their own) in one query, searched and filtered for the To-dos screen, in its
 *  sections. Changes go through each row (`useTodoActions`). */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { store, type GlobalTodoEntry } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { matchesFilter, sectionTodos, type TodoFilter, type TodoSection } from '@features/todos/utils/todoSections';

export type { TodoFilter };

/** Every word typed is in the to-do, its meeting's title or its owner. */
function matchesSearch(todo: GlobalTodoEntry, words: string[]): boolean {
  const haystack = [todo.text, todo.meetingTitle ?? '', todo.owner ?? ''].join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function useGlobalTodos() {
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { data: all = [], isLoading } = useQuery({
    queryKey: queryKeys.storeGlobalTodos(),
    queryFn: async (): Promise<GlobalTodoEntry[]> => (await store.todos.listGlobal(undefined, 500, 0)).items,
  });

  const sections: TodoSection<GlobalTodoEntry>[] = useMemo(() => {
    const words = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sectionTodos(all.filter((todo) => matchesFilter(todo, filter) && matchesSearch(todo, words)));
  }, [all, filter, searchQuery]);

  const open = all.filter((todo) => !todo.completed).length;
  return {
    sections,
    hasAny: all.length > 0,
    counts: { open, done: all.length - open },
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
  };
}
