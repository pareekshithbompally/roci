/** update_todo: mark a to-do done or open, or change its text, due date, reminder or owner; confirmed in chat first. */

import { z } from 'zod';
import { day, defineTool, fail, idFrom, localDateTime, localDateTimeOf, text } from '@extensions/tools/contract';
import { todoNotFound } from '@extensions/tools/data';
import { changeDetails, pastReminder, submitTodoChange, type TodoChange } from '@extensions/tools/todoChanges';
import { store } from '@services/db';

export const updateTodoTool = defineTool({
  name: 'update_todo',
  description:
    'Propose a change to one existing to-do: done=true marks it done, done=false reopens it; text, due_date, ' +
    'reminder_at and owner replace those. Give only what changes. Get todo_id from list_todos or get_meeting first. ' +
    'In chat the user confirms the change on a card before it is saved.',
  input: z.object({
    todo_id: idFrom('list_todos or get_meeting'),
    done: z.boolean().optional().describe('true: mark done. false: mark not done.'),
    text: text('New wording for the task.').optional(),
    due_date: day.optional().describe('New due date, YYYY-MM-DD.'),
    reminder_at: localDateTime.optional().describe('New reminder, local time YYYY-MM-DDTHH:MM. Must be in the future.'),
    owner: text('New owner.').optional(),
  }),
  writes: true,

  async execute({ todo_id, done, text: newText, due_date, reminder_at, owner }, context) {
    const [todo] = await store.todos.get([todo_id]);
    if (!todo) return todoNotFound(todo_id);
    if ([done, newText, due_date, reminder_at, owner].every((v) => v === undefined)) {
      return fail('Nothing to change: give done, text, due_date, reminder_at or owner.');
    }
    const past = reminder_at ? pastReminder(reminder_at) : null;
    if (past) return past;

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
  },
});
