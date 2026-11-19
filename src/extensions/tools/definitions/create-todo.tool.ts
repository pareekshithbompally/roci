/** create_todo: a new to-do, of its own or from a meeting; the user confirms it in chat before it is saved. */

import { z } from 'zod';
import { CONFIRMED_ON_A_CARD, day, defineTool, idFrom, localDateTime, text } from '@extensions/tools/contract';
import { findMeeting, meetingNotFound } from '@extensions/tools/data';
import { changeDetails, pastReminder, submitTodoChange, type TodoChange } from '@extensions/tools/todoChanges';

export const createTodoTool = defineTool({
  name: 'create_todo',
  description:
    'Propose one new to-do for the user, with a reminder when they want one: use it when they ask to add a task, or to ' +
    'remember or be reminded of something. Call it once per to-do. Give meeting_id only when the to-do comes from a ' +
    `specific meeting. ${CONFIRMED_ON_A_CARD}`,
  input: z.object({
    text: text('What to do, as a short task: "Send the Q3 report to Priya".'),
    due_date: day.optional().describe('When it is due, YYYY-MM-DD.'),
    reminder_at: localDateTime.optional().describe('When to notify the user, local time YYYY-MM-DDTHH:MM. Must be in the future.'),
    owner: text('Who will do it, when it is not the user.').optional(),
    meeting_id: idFrom('search_meetings or list_meetings', 'The meeting it comes from.').optional(),
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
