/** What the tools read: the database as it is now (never a copy the chat was handed), and the shapes they show it in. */

import { queryClient } from '@shared/query/queryClient';
import { meetingsQuery } from '@shared/contexts/HistoryContext';
import type { HistoryItem, TodoEntry } from '@shared/types';
import { fail, localDateTimeOf } from './contract';
import type { ToolResult } from './types';

/** Every meeting, read again from roci.db (the app's meeting list refreshes with it). */
export function currentMeetings(): Promise<HistoryItem[]> {
  return queryClient.fetchQuery({ ...meetingsQuery, staleTime: 0 });
}

export async function findMeeting(id: string): Promise<HistoryItem | undefined> {
  return (await currentMeetings()).find((meeting) => meeting.id === id);
}

export function meetingNotFound(id: string): ToolResult {
  return fail(`No meeting has the ID "${id}". Get meeting IDs from list_meetings or search_meetings.`);
}

export function todoNotFound(id: string): ToolResult {
  return fail(`No to-do has the id "${id}". Get to-do ids from list_todos.`);
}

/** `- [ ] Book flights (due 2026-11-20, owner Sam, reminder 2026-11-19T09:00) — id: …`: the id update_todo and
 *  delete_todo take, and dates in the form they take them. */
export function todoLine(todo: TodoEntry): string {
  const details = [
    todo.dueDate && `due ${todo.dueDate.slice(0, 10)}`,
    todo.owner && `owner ${todo.owner}`,
    todo.reminder && `reminder ${localDateTimeOf(Date.parse(todo.reminder.dateTime))}`,
  ].filter(Boolean);
  const detail = details.length > 0 ? ` (${details.join(', ')})` : '';
  return `- [${todo.completed ? 'x' : ' '}] ${todo.text}${detail} — id: ${todo.id}`;
}
