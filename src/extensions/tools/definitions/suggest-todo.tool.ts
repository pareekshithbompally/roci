/** suggest_todo: add a to-do, change one (done, reopen, text, due date, reminder, owner) or delete one. In chat the user
 *  confirms it on a card before it is saved; a coding agent, which asked the user already, has it saved at once. */

import { z } from 'zod';
import type { ToolContext, ToolResult } from '@extensions/tools/types';
import { CONFIRMED_ON_A_CARD, day, defineTool, fail, idFrom, localDateTime, localDateTimeOf, text } from '@extensions/tools/contract';
import { findMeeting, meetingNotFound, todoNotFound } from '@extensions/tools/data';
import { changeDetails, pastReminder, submitTodoChange, type TodoChange } from '@extensions/tools/todoChanges';
import { store } from '@services/db';

const input = z.object({
  action: z.enum(['add', 'update', 'delete']).describe('add a new to-do, update one (done, text, dates, owner), or delete one for good.'),
  todo_id: idFrom('find in todos or read of a meeting', 'update / delete: the to-do.').optional(),
  text: text('add: what to do, as a short task ("Send the Q3 report to Priya"). update: new wording.').optional(),
  done: z.boolean().optional().describe('update: true marks it done, false reopens it.'),
  due_date: day.optional().describe('When it is due, YYYY-MM-DD.'),
  reminder_at: localDateTime.optional().describe('When to notify the user, local time YYYY-MM-DDTHH:MM. Must be in the future.'),
  owner: text('Who will do it, when it is not the user.').optional(),
  meeting_id: idFrom('find in meetings', 'add: the meeting it comes from, only when it comes from one.').optional(),
});
type Input = z.output<typeof input>;

async function addTodo({ text: task, due_date, reminder_at, owner, meeting_id }: Input, context: ToolContext): Promise<ToolResult> {
  if (!task) return fail('add needs text: what to do.');
  const meeting = meeting_id ? await findMeeting(meeting_id) : undefined;
  if (meeting_id && !meeting) return meetingNotFound(meeting_id);
  const change: TodoChange = {
    action: 'create',
    todoId: null,
    originalText: null,
    text: task,
    dueDate: due_date ?? null,
    reminderDateTime: reminder_at ?? null,
    owner: owner ?? null,
    done: null,
    meetingId: meeting?.id ?? null,
    meetingTitle: meeting?.title ?? null,
  };
  return submitTodoChange(change, context, `create to-do "${task}"${changeDetails(change)}`);
}

async function updateTodo(args: Input, context: ToolContext): Promise<ToolResult> {
  const { todo_id, done, text: newText, due_date, reminder_at, owner } = args;
  const [todo] = await store.todos.get([todo_id ?? '']);
  if (!todo) return todoNotFound(todo_id ?? '');
  if ([done, newText, due_date, reminder_at, owner].every((v) => v === undefined)) {
    return fail('Nothing to change: give done, text, due_date, reminder_at or owner.');
  }
  const change: TodoChange = {
    action: 'update',
    todoId: todo.id,
    originalText: todo.text,
    text: newText ?? todo.text,
    dueDate: due_date ?? todo.dueDate ?? null,
    reminderDateTime: reminder_at ?? (todo.reminder ? localDateTimeOf(Date.parse(todo.reminder.dateTime)) : null),
    owner: owner ?? todo.owner ?? null,
    done: done ?? null,
    meetingId: todo.meetingId,
    meetingTitle: todo.meetingTitle,
  };
  const verb = done === true ? 'mark done' : done === false ? 'reopen' : 'update';
  return submitTodoChange(change, context, `${verb} to-do "${todo.text}"${changeDetails(change)}`);
}

async function deleteTodo({ todo_id }: Input, context: ToolContext): Promise<ToolResult> {
  const [todo] = await store.todos.get([todo_id ?? '']);
  if (!todo) return todoNotFound(todo_id ?? '');
  const change: TodoChange = {
    action: 'delete',
    todoId: todo.id,
    originalText: todo.text,
    text: todo.text,
    dueDate: todo.dueDate ?? null,
    reminderDateTime: null,
    owner: todo.owner ?? null,
    done: null,
    meetingId: todo.meetingId,
    meetingTitle: todo.meetingTitle,
  };
  return submitTodoChange(change, context, `delete to-do "${todo.text}"`);
}

const SUGGEST: Record<Input['action'], (args: Input, context: ToolContext) => Promise<ToolResult>> = {
  add: addTodo,
  update: updateTodo,
  delete: deleteTodo,
};

export const suggestTodoTool = defineTool({
  name: 'suggest_todo',
  description:
    'Suggest one to-do change. add: when the user asks to add a task, or to be reminded to do something (a fact to remember goes to suggest_memory). update: ' +
    `give only what changes (done=true finishes it). delete: remove it for good. todo_id comes from find. ${CONFIRMED_ON_A_CARD}`,
  input,
  writes: true,
  async execute(args, context) {
    if (args.action !== 'add' && !args.todo_id) return fail(`${args.action} needs todo_id: get it from find in todos.`);
    const past = args.reminder_at ? pastReminder(args.reminder_at) : null;
    if (past) return past;
    return SUGGEST[args.action](args, context);
  },
});
