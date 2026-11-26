/** How every to-do list is ordered and narrowed (To-dos and a meeting's tab): open ones by when they are due (Overdue,
 *  Today, Upcoming soonest first, No date), then the completed ones; and the ⋯ menu's filters. */

import type { ActionItem } from '@shared/types';
import { dueState, parseDateLoose } from '@shared/utils/todo.utils';
import { TODOS_CONFIG } from '@config/todos.config';

export type TodoFilter = keyof typeof TODOS_CONFIG.page.filters;
export type TodoSectionKey = keyof typeof TODOS_CONFIG.page.sections;

export interface TodoSection<T> {
  key: TodoSectionKey;
  label: string;
  todos: T[];
}

const ORDER: TodoSectionKey[] = ['overdue', 'today', 'upcoming', 'someday', 'done'];

function sectionOf(todo: ActionItem): TodoSectionKey {
  if (todo.completed) return 'done';
  const state = dueState(todo.dueDate);
  return state === 'none' ? 'someday' : state;
}

const dueTime = (todo: ActionItem) => (todo.dueDate ? parseDateLoose(todo.dueDate)?.getTime() ?? 0 : 0);

export function matchesFilter(todo: ActionItem, filter: TodoFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed') return todo.completed;
  if (filter === 'open') return !todo.completed;
  return sectionOf(todo) === filter;
}

/** The list's sections, empty ones left out; dated ones soonest first. */
export function sectionTodos<T extends ActionItem>(todos: T[]): TodoSection<T>[] {
  const by = new Map<TodoSectionKey, T[]>();
  for (const todo of todos) {
    const key = sectionOf(todo);
    by.set(key, [...(by.get(key) ?? []), todo]);
  }
  return ORDER.filter((key) => by.has(key)).map((key) => ({
    key,
    label: TODOS_CONFIG.page.sections[key],
    todos: key === 'someday' || key === 'done' ? by.get(key)! : [...by.get(key)!].sort((a, b) => dueTime(a) - dueTime(b)),
  }));
}
