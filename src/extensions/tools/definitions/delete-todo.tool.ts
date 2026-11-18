/** delete_todo: remove one to-do (and its reminder) by id; confirmed in chat first. */

import { z } from 'zod';
import { defineTool, idFrom } from '@extensions/tools/contract';
import { todoNotFound } from '@extensions/tools/data';
import { submitTodoChange } from '@extensions/tools/todoChanges';
import { store } from '@services/db';

export const deleteTodoTool = defineTool({
  name: 'delete_todo',
  description:
    'Propose deleting one to-do for good, with its reminder. To finish a to-do, use update_todo with done=true ' +
    'instead. Get todo_id from list_todos or get_meeting first. In chat the user confirms on a card before it is deleted.',
  input: z.object({ todo_id: idFrom('list_todos or get_meeting') }),
  writes: true,

  async execute({ todo_id }, context) {
    const [todo] = await store.todos.get([todo_id]);
    if (!todo) return todoNotFound(todo_id);
    return submitTodoChange(
      {
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
      },
      context,
      `delete to-do "${todo.text}"`,
    );
  },
});
