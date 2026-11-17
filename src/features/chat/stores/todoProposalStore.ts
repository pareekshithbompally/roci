/** Queue of proposed todos awaiting the user's edit and confirm in TodoConfirmationBanner. */

import { useSyncExternalStore } from 'react';
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

type Listener = () => void;

const listeners = new Set<Listener>();
let proposals: TodoProposal[] = [];

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export const todoProposalStore = {
  /** Add a proposal to the queue (called by orchestrator — once per mutation). */
  propose(p: TodoProposal) {
    proposals = [...proposals, { ...p, status: 'pending' }];
    emitChange();
  },

  /** Update a single field on a specific proposal (called by banner inline editing). */
  updateField<K extends keyof TodoProposal>(id: string, field: K, value: TodoProposal[K]) {
    proposals = proposals.map(p =>
      p.id === id && p.status === 'pending' ? { ...p, [field]: value } : p
    );
    emitChange();
  },

  /** Remove a single proposal from the queue without writing. */
  remove(id: string) {
    proposals = proposals.filter(p => p.id !== id);
    emitChange();
  },

  /** Commit all pending proposals — writes to DB, schedules reminders, emits refresh event. */
  async commitAll(): Promise<boolean> {
    const pending = proposals.filter(p => p.status === 'pending');
    if (pending.length === 0) return false;

    // Mark all as committing
    proposals = proposals.map(p =>
      p.status === 'pending' ? { ...p, status: 'committing' as const } : p
    );
    emitChange();

    let allOk = true;

    for (const p of pending) {
      try {
        await commitSingle(p);
        proposals = proposals.map(x =>
          x.id === p.id ? { ...x, status: 'committed' as const } : x
        );
      } catch (error: unknown) {
        console.error('[TodoProposalStore] Commit failed for:', p.text, error);
        proposals = proposals.map(x =>
          x.id === p.id ? {
            ...x,
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Failed to save',
          } : x
        );
        allOk = false;
      }
    }

    emitChange();
    invalidateTodos();

    // Auto-clear after short delay so committed state is visible
    setTimeout(() => {
      const allDone = proposals.every(p => p.status === 'committed' || p.status === 'error');
      if (allDone) {
        proposals = [];
        emitChange();
      }
    }, UI_CONFIG.activityTray.settleDelay);

    return allOk;
  },

  /** Cancel all pending proposals without writing. */
  cancelAll() {
    proposals = [];
    emitChange();
  },

  /** Get current proposals (for non-React reads). */
  getSnapshot(): TodoProposal[] {
    return proposals;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
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

async function create(p: TodoProposal): Promise<void> {
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
  if (p.action === 'create') return create(p);
  if (!p.todoId) throw new Error('No to-do to change');
  return p.action === 'delete' ? remove(p.todoId) : update(p, p.todoId);
}

/** Hook to subscribe to proposals state. */
export function useTodoProposals(): TodoProposal[] {
  return useSyncExternalStore(
    todoProposalStore.subscribe,
    todoProposalStore.getSnapshot,
    todoProposalStore.getSnapshot,
  );
}
