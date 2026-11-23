/** To-do changes the AI proposed in chat, waiting on the card above the chat box (TodoConfirmationBanner); an MCP agent's,
 *  already approved, are written at once by the same commit. */

import { store } from '@services/db';
import { reminderService } from '@services/reminder.service';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { normalizeDueDate } from '@shared/utils/todo.utils';
import { remindersSync } from '@services/reminders';
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
  const todoId = crypto.randomUUID();
  await store.todos.upsert({
    id: todoId,
    meetingId: p.meetingId,
    text: p.text,
    owner: p.owner || undefined,
    dueDate: p.dueDate ? normalizeDueDate(p.dueDate) : undefined,
    completed: false,
    source: 'user',
    createdAt: new Date().toISOString(),
  });
  if (p.reminderDateTime) await remind(todoId, p, p.reminderDateTime);
  void remindersSync.added([todoId]);
}

/** Applies the proposal's fields over the stored to-do; what it doesn't name stays as it is. */
async function update(p: TodoChange, todoId: string): Promise<void> {
  const [current] = await store.todos.get([todoId]);
  if (!current) throw new Error('This to-do no longer exists');
  const completed = p.done ?? current.completed;
  await store.todos.upsert({
    id: todoId,
    meetingId: current.meetingId,
    text: p.text,
    owner: p.owner || undefined,
    dueDate: p.dueDate ? normalizeDueDate(p.dueDate) : undefined,
    completed,
    source: current.source,
  });
  if (completed) await reminderService.cancel(todoId);
  // Compared as instants: the proposal's time is local, the stored one UTC.
  else if (p.reminderDateTime && Date.parse(p.reminderDateTime) !== Date.parse(current.reminder?.dateTime ?? '')) await remind(todoId, p, p.reminderDateTime);
  void remindersSync.changed(todoId);
}

async function remove(todoId: string): Promise<void> {
  await reminderService.cancel(todoId);
  await store.todos.delete(todoId);
  void remindersSync.removed([todoId]);
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
  return p.action === 'delete' ? remove(p.todoId) : update(p, p.todoId);
}

export const todoProposalStore = createProposalQueue<TodoProposal>('TodoProposalStore', commitSingle, invalidateTodos);

export const useTodoProposals = todoProposalStore.useProposals;
