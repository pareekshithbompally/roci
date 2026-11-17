/** list_todos: open, done or all to-dos (one meeting's, or everyone's), each with the id the other to-do tools take. */

import { z } from 'zod';
import { defineTool, idFrom, ok } from '@extensions/tools/contract';
import { findMeeting, meetingNotFound, todoLine } from '@extensions/tools/data';
import { MAX_TODOS_FOR_LLM } from '@extensions/tools/constants';
import { store, type GlobalTodoEntry } from '@services/db';
import { TODOS_CONFIG } from '@config/todos.config';

const STATUS = { open: false, done: true, all: undefined } as const;
type Status = keyof typeof STATUS;

const matches = (status: Status) => (todo: GlobalTodoEntry) => STATUS[status] === undefined || todo.completed === STATUS[status];

/** Lines grouped under their meeting (or General), in the order the to-dos came. */
function grouped(todos: GlobalTodoEntry[]): string[] {
  const groups = new Map<string, string[]>();
  for (const todo of todos) {
    const heading = todo.meetingTitle ? `From "${todo.meetingTitle}" (meeting ID: ${todo.meetingId}):` : `${TODOS_CONFIG.general} (not from a meeting):`;
    groups.set(heading, [...(groups.get(heading) ?? []), todoLine(todo)]);
  }
  return [...groups].flatMap(([heading, lines]) => ['', heading, ...lines]);
}

export const listTodosTool = defineTool({
  name: 'list_todos',
  description:
    "List the user's to-dos with each one's id, due date, owner and reminder: open ones by default. Give meeting_id " +
    'for one meeting\'s to-dos only. Call this before update_todo or delete_todo to get the id of the to-do to change.',
  input: z.object({
    status: z.enum(['open', 'done', 'all']).default('open').describe('open (not done yet), done, or all.'),
    meeting_id: idFrom('list_meetings or search_meetings').optional().describe('Only this meeting\'s to-dos.'),
  }),

  async execute({ status, meeting_id }) {
    let todos: GlobalTodoEntry[];
    let total: number;
    if (meeting_id) {
      if (!(await findMeeting(meeting_id))) return meetingNotFound(meeting_id);
      todos = (await store.todos.listForMeeting(meeting_id)).filter(matches(status));
      total = todos.length;
    } else {
      ({ items: todos, total } = await store.todos.listGlobal(STATUS[status], MAX_TODOS_FOR_LLM, 0));
    }
    const label = status === 'all' ? 'To-dos' : `${status === 'open' ? 'Open' : 'Done'} to-dos`;
    if (todos.length === 0) return ok(`No ${label.toLowerCase()}${meeting_id ? ' in that meeting' : ''}.`, { resultCount: 0 });

    const shown = todos.slice(0, MAX_TODOS_FOR_LLM);
    const count = shown.length < total ? `${total} (showing the ${shown.length} newest)` : `${total}`;
    return ok([`${label}: ${count}`, ...grouped(shown)].join('\n'), { resultCount: shown.length });
  },
});
