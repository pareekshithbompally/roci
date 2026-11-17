/** create_todo: a new to-do, of its own or from a meeting; the user confirms it in chat before it is saved. */

import { z } from 'zod';
import { day, defineTool, idFrom, localDateTime, text } from '@extensions/tools/contract';
import { findMeeting, meetingNotFound } from '@extensions/tools/data';
import { changeDetails, pastReminder, submitTodoChange, type TodoChange } from '@extensions/tools/todoChanges';

export const createTodoTool = defineTool({
  name: 'create_todo',
  description:
    'Create one to-do for the user. Call it once per to-do. Leave out meeting_id unless the to-do comes from a ' +
    'specific meeting (get the ID from search_meetings or list_meetings). In chat the user confirms it on a card ' +
    'before it is saved: say you proposed it, not that it is saved.',
  input: z.object({
    text: text('What to do, as a short task: "Send the Q3 report to Priya".'),
    due_date: day.optional().describe('When it is due, YYYY-MM-DD.'),
    reminder_at: localDateTime.optional().describe('When to notify the user, local time YYYY-MM-DDTHH:MM. Must be in the future.'),
    owner: text('Who will do it, when it is not the user.').optional(),
    meeting_id: idFrom('search_meetings or list_meetings').optional().describe('The meeting it comes from, if any.'),
  }),
  writes: true,

  async execute({ text: task, due_date, reminder_at, owner, meeting_id }, context) {
    const meeting = meeting_id ? await findMeeting(meeting_id) : undefined;
    if (meeting_id && !meeting) return meetingNotFound(meeting_id);
    const past = reminder_at ? pastReminder(reminder_at) : null;
    if (past) return past;

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
  },
});
