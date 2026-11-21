/** What the tools read: the database as it is now (never a copy the chat was handed), and the shapes they show it in. */

import { fetchMeetingBrief } from '@shared/query/items';
import type { HistoryItem, TodoEntry } from '@shared/types';
import { fail, localDateTimeOf } from './contract';
import type { ToolResult } from './types';

/** One meeting's row, read from roci.db; undefined when no meeting has that id. */
export async function findMeeting(id: string): Promise<HistoryItem | undefined> {
  return (await fetchMeetingBrief(id)) ?? undefined;
}

export function meetingNotFound(id: string): ToolResult {
  return fail(`No meeting has the ID "${id}". Get meeting IDs from find in meetings.`);
}

export function todoNotFound(id: string): ToolResult {
  return fail(`No to-do has the id "${id}". Get to-do ids from find in todos.`);
}

/** `- [ ] Book flights (due 2026-11-20, owner Sam, reminder 2026-11-19T09:00) — id: …`: the id suggest_todo takes, and
 *  dates in the form it takes them. */
export function todoLine(todo: TodoEntry): string {
  const details = [
    todo.dueDate && `due ${todo.dueDate.slice(0, 10)}`,
    todo.owner && `owner ${todo.owner}`,
    todo.reminder && `reminder ${localDateTimeOf(Date.parse(todo.reminder.dateTime))}`,
  ].filter(Boolean);
  const detail = details.length > 0 ? ` (${details.join(', ')})` : '';
  return `- [${todo.completed ? 'x' : ' '}] ${todo.text}${detail} — id: ${todo.id}`;
}
