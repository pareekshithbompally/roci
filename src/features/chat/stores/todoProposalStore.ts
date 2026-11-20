/** Queue of proposed todos awaiting the user's edit and confirm in TodoConfirmationBanner. */

import { create } from 'zustand';
import { store } from '@services/db';
import { UI_CONFIG } from '@config/ui.config';
import { reminderService } from '@services/reminder.service';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { normalizeDueDate } from '@shared/utils/todo.utils';
import { remindersSync } from '@services/reminders';

export interface TodoProposal {
  id: string;
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

  status: 'pending' | 'committing' | 'committed' | 'error' | 'cancelled';
  error?: string;
}

/** The queue; replaced on each change. */
const useProposalStore = create<{ proposals: TodoProposal[] }>(() => ({ proposals: [] }));
const proposals = (): TodoProposal[] => useProposalStore.getState().proposals;
const setProposals = (next: TodoProposal[]): void => useProposalStore.setState({ proposals: next });
/** Every proposal through `change`. */
const mapProposals = (change: (p: TodoProposal) => TodoProposal): void => setProposals(proposals().map(change));

export const todoProposalStore = {
  /** Add a proposal to the queue (called by orchestrator — once per mutation). */
  propose(p: TodoProposal) {
    setProposals([...proposals(), { ...p, status: 'pending' }]);
  },

  /** Update a single field on a specific proposal (called by banner inline editing). */
  updateField<K extends keyof TodoProposal>(id: string, field: K, value: TodoProposal[K]) {
    mapProposals((p) => (p.id === id && p.status === 'pending' ? { ...p, [field]: value } : p));
  },

  /** Remove a single proposal from the queue without writing. */
  remove(id: string) {
    setProposals(proposals().filter((p) => p.id !== id));
  },

  /** Commit all pending proposals — writes to DB, schedules reminders, emits refresh event. */
  async commitAll(): Promise<boolean> {
    const pending = proposals().filter((p) => p.status === 'pending');
    if (pending.length === 0) return false;

    // Mark all as committing
    mapProposals((p) => (p.status === 'pending' ? { ...p, status: 'committing' as const } : p));

    let allOk = true;

    for (const p of pending) {
      try {
        await commitSingle(p);
        mapProposals((x) => (x.id === p.id ? { ...x, status: 'committed' as const } : x));
      } catch (error: unknown) {
        console.error('[TodoProposalStore] Commit failed for:', p.text, error);
        const message = error instanceof Error ? error.message : 'Failed to save';
        mapProposals((x) => (x.id === p.id ? { ...x, status: 'error' as const, error: message } : x));
        allOk = false;
      }
    }

    invalidateTodos();

    // Auto-clear after short delay so committed state is visible
    setTimeout(() => {
      const allDone = proposals().every((p) => p.status === 'committed' || p.status === 'error');
      if (allDone) setProposals([]);
    }, UI_CONFIG.activityTray.settleDelay);

    return allOk;
  },

  /** Cancel all pending proposals without writing. */
  cancelAll() {
    setProposals([]);
  },
};

/** Write one proposal without the banner, for a caller that already has approval (an MCP coding agent). */
export async function commitTodoProposal(p: TodoProposal): Promise<void> {
  await commitSingle(p);
  invalidateTodos();
}

/** Every stored to-do list (each meeting's and the global one) reads again. */
function invalidateTodos(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.storeTodosAll() });
}

async function createTodo(p: TodoProposal): Promise<void> {
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
async function update(p: TodoProposal, todoId: string): Promise<void> {
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
  else if (p.reminderDateTime && p.reminderDateTime !== current.reminder?.dateTime) await remind(todoId, p, p.reminderDateTime);
  void remindersSync.changed(todoId);
}

async function remove(todoId: string): Promise<void> {
  await reminderService.cancel(todoId);
  await store.todos.delete(todoId);
}

async function remind(todoId: string, p: TodoProposal, at: string): Promise<void> {
  const ok = await reminderService.schedule({
    todoId,
    meetingId: p.meetingId,
    todoText: p.text,
    meetingTitle: p.meetingTitle,
    reminderDateTime: at,
  });
  if (!ok) console.warn('[TodoProposalStore] Reminder not scheduled for:', p.text);
}

async function commitSingle(p: TodoProposal): Promise<void> {
  if (p.action === 'create') return createTodo(p);
  if (!p.todoId) throw new Error('No to-do to change');
  return p.action === 'delete' ? remove(p.todoId) : update(p, p.todoId);
}

/** The proposals queue; re-renders when it changes. */
export const useTodoProposals = (): TodoProposal[] => useProposalStore((s) => s.proposals);
