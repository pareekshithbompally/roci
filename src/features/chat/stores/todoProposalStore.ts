/** To-do changes the AI proposed in chat, waiting on the card above the chat box (TodoConfirmationBanner); an MCP agent's,
 *  already approved, are written at once by the same commit. */

import { store } from '@services/db';
import { reminderService } from '@services/reminder.service';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { todosService } from '@services/todos.service';
import { showToast } from '@shared/ui';
import { TODOS_CONFIG } from '@config/todos.config';
import { createProposalQueue, type Proposal } from '@features/chat/stores/proposalQueue';

export interface TodoProposal extends Proposal {
  action: 'create' | 'update' | 'delete';
  /** The to-do it changes (update, delete); null when creating. */
  todoId: string | null;
  /** That to-do's text before the change, shown on the card (update, delete). */
  originalText: string | null;

  // Editable fields
  text: string;
  dueDate: string | null;
  reminderDateTime: string | null;
  owner: string | null;
  /** update: true marks it done, false opens it again; null leaves it as it is. */
  done: boolean | null;

  /** The meeting it belongs to; null for a to-do of its own. */
  meetingId: string | null;
  meetingTitle: string | null;
}

/** A to-do change as a tool asks for it, before it is proposed. */
export type TodoChange = Omit<TodoProposal, keyof Proposal>;

/** Write one change without the card, for a caller that already has approval (an MCP coding agent). */
export async function commitTodoProposal(change: TodoChange): Promise<void> {
  await commitSingle(change);
  invalidateTodos();
}

/** Every stored to-do list (each meeting's and the global one) reads again. */
function invalidateTodos(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.storeTodosAll() });
}

async function createTodo(p: TodoChange): Promise<void> {
  const id = crypto.randomUUID();
  await todosService.create({ id, meetingId: p.meetingId, text: p.text, dueDate: p.dueDate ?? undefined, owner: p.owner ?? undefined });
  if (p.reminderDateTime) await remind(id, p, p.reminderDateTime);
}

/** Applies the proposal's fields over the stored to-do; marking it done or open again goes the same way as a tap. */
async function update(p: TodoChange, todoId: string): Promise<void> {
  const [current] = await store.todos.get([todoId]);
  if (!current) throw new Error('This to-do no longer exists');
  await todosService.edit(todoId, { text: p.text, dueDate: p.dueDate, owner: p.owner });
  const done = p.done ?? current.completed;
  if (done !== current.completed) await todosService.setDone(todoId, done);
  // Compared as instants: the proposal's time is local, the stored one UTC.
  if (!done && p.reminderDateTime && Date.parse(p.reminderDateTime) !== Date.parse(current.reminder?.dateTime ?? '')) await remind(todoId, p, p.reminderDateTime);
}

async function remind(todoId: string, p: TodoChange, at: string): Promise<void> {
  const outcome = await reminderService.schedule({
    todoId,
    meetingId: p.meetingId,
    todoText: p.text,
    meetingTitle: p.meetingTitle,
    reminderDateTime: at,
  });
  // The to-do itself is saved; its card closes, so a reminder that won't fire is said here.
  if (outcome !== 'scheduled') showToast(outcome === 'denied' ? TODOS_CONFIG.reminder.denied : TODOS_CONFIG.reminder.failed, 'warning');
}

async function commitSingle(p: TodoChange): Promise<void> {
  if (p.action === 'create') return createTodo(p);
  if (!p.todoId) throw new Error('No to-do to change');
  return p.action === 'delete' ? todosService.remove(p.todoId) : update(p, p.todoId);
}

export const todoProposalStore = createProposalQueue<TodoProposal>('TodoProposalStore', commitSingle, invalidateTodos);

export const useTodoProposals = todoProposalStore.useProposals;
