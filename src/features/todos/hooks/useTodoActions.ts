/** Every to-do change a screen makes, shown at once in every to-do list on screen (To-dos and each meeting's), saved through
 *  the one writer (`todosService`), undone if the save fails, and read again from disk once it settles. */

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { todosService, type TodoEdit } from '@services/todos.service';
import { fetchMeetingBrief } from '@shared/query/items';
import type { HistoryItem, ActionItem } from '@shared/types';
import type { GlobalTodoEntry } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { UNTITLED_MEETING } from '@config/meetingLive.config';

/** A meeting's list as its tab reads it. */
export interface MeetingTodosData {
  userTodos: ActionItem[];
  aiTodos: ActionItem[];
}

type TodoList = GlobalTodoEntry[] | MeetingTodosData;
type Change =
  | { kind: 'add'; entry: GlobalTodoEntry }
  | { kind: 'edit'; id: string; edit: TodoEdit }
  | { kind: 'done'; id: string; done: boolean }
  | { kind: 'remove'; id: string };

/** One row after `change` (null: gone). */
function changed<T extends ActionItem>(todo: T, change: Exclude<Change, { kind: 'add' }>): T | null {
  if (todo.id !== change.id) return todo;
  if (change.kind === 'remove') return null;
  if (change.kind === 'done') return { ...todo, completed: change.done, reminder: change.done ? undefined : todo.reminder };
  const { text, dueDate, owner } = change.edit;
  return { ...todo, ...(text !== undefined && { text }), ...(dueDate !== undefined && { dueDate: dueDate ?? undefined }), ...(owner !== undefined && { owner: owner ?? undefined }) };
}

const each = <T extends ActionItem>(rows: T[], change: Exclude<Change, { kind: 'add' }>) =>
  rows.map((row) => changed(row, change)).filter((row): row is T => row !== null);

/** A list with `change` in it. A new to-do goes to the top of To-dos; its meeting's list reads it once it is saved. */
function apply(list: TodoList, change: Change): TodoList {
  if (Array.isArray(list)) return change.kind === 'add' ? [change.entry, ...list] : each(list, change);
  if (change.kind === 'add') return list;
  return { userTodos: each(list.userTodos, change), aiTodos: each(list.aiTodos, change) };
}

/** Shows `change` in every to-do list in the cache; returns what they were, to undo it. */
async function show(client: QueryClient, change: Change): Promise<[QueryKey, TodoList | undefined][]> {
  await client.cancelQueries({ queryKey: queryKeys.storeTodosAll() });
  const before = client.getQueriesData<TodoList>({ queryKey: queryKeys.storeTodosAll() });
  for (const [key, list] of before) if (list) client.setQueryData<TodoList>(key, apply(list, change));
  return before;
}

/** Writes `change` through the one writer. */
function save(change: Change): Promise<void> {
  if (change.kind === 'add') {
    const { id, meetingId, text, dueDate } = change.entry;
    return todosService.create({ id, meetingId, text, dueDate });
  }
  if (change.kind === 'edit') return todosService.edit(change.id, change.edit);
  if (change.kind === 'done') return todosService.setDone(change.id, change.done);
  return todosService.remove(change.id);
}

export interface TodoActions {
  /** A new to-do, in a meeting or of its own (null). */
  add: (meetingId: string | null, text: string, dueDate?: string) => Promise<void>;
  edit: (id: string, edit: TodoEdit) => Promise<void>;
  setDone: (id: string, done: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useTodoActions(): TodoActions {
  const client = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: save,
    onMutate: (change) => show(client, change),
    onError: (_error, _change, before) => before?.forEach(([key, list]) => client.setQueryData(key, list)),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.storeTodosAll() }),
  });

  return useMemo(() => ({
    add: async (meetingId, text, dueDate) => {
      const meeting = meetingId ? client.getQueryData<HistoryItem | null>(queryKeys.meetingBrief(meetingId)) ?? await fetchMeetingBrief(meetingId) : null;
      await mutateAsync({
        kind: 'add',
        entry: {
          id: crypto.randomUUID(),
          text,
          dueDate,
          completed: false,
          source: 'user',
          createdAt: new Date().toISOString(),
          meetingId,
          meetingTitle: meetingId ? meeting?.title || UNTITLED_MEETING : null,
          meetingCreatedAt: meeting?.timestamp ?? null,
        },
      });
    },
    edit: (id, edit) => mutateAsync({ kind: 'edit', id, edit }),
    setDone: (id, done) => mutateAsync({ kind: 'done', id, done }),
    remove: (id) => mutateAsync({ kind: 'remove', id }),
  }), [client, mutateAsync]);
}
