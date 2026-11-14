/**
 * Todo Proposal Store
 *
 * Lightweight external store (useSyncExternalStore pattern, matches streamingStore.ts).
 * Holds an ordered queue of TodoProposals — supports batch creation from multi-todo requests.
 *
 * Lifecycle:
 * 1. Orchestrator detects manage_todos intent → calls propose() for each mutation
 * 2. TodoConfirmationBanner renders all proposals (via useTodoProposals hook)
 * 3. User edits fields → updateField(id, field, value)
 * 4. User clicks Create All → commitAll() writes each to DB + schedules reminders
 * 5. User can remove individual proposals or cancel all
 */

import { useSyncExternalStore } from 'react';
import { store } from '@services/db';
import { reminderService } from '@services/reminder.service';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { normalizeDueDate } from '@shared/utils/todo.utils';

export interface TodoProposal {
  id: string;
  action: 'create' | 'toggle' | 'update' | 'delete';

  // Editable fields
  text: string;
  dueDate: string | null;
  reminderDateTime: string | null;
  owner: string | null;

  // Meeting linkage
  meetingId: string;
  meetingTitle: string;
  isGeneral: boolean;

  // For toggle/update/delete — the matched existing todo
  matchedTodoId: string | null;
  matchedTodoText: string | null;

  status: 'pending' | 'committing' | 'committed' | 'error' | 'cancelled';
  error?: string;
}

// General todos bucket — not a real meeting
export const GENERAL_MEETING_ID = '_general';
export const GENERAL_MEETING_TITLE = 'General';

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

    // Invalidate all affected meeting-specific and global todo queries
    const affectedMeetings = new Set(
      pending.map(p => p.meetingId).filter(Boolean)
    );
    for (const meetingId of affectedMeetings) {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos(meetingId) });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.globalTodos() });

    // Auto-clear after short delay so committed state is visible
    setTimeout(() => {
      const allDone = proposals.every(p => p.status === 'committed' || p.status === 'error');
      if (allDone) {
        proposals = [];
        emitChange();
      }
    }, 2000);

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

async function commitSingle(p: TodoProposal): Promise<void> {
  if (p.action === 'create') {
    const normalizedDueDate = p.dueDate ? normalizeDueDate(p.dueDate) : undefined;

    const todoId = crypto.randomUUID();
    await store.todos.upsert({
      id: todoId,
      meetingId: p.meetingId,
      text: p.text,
      owner: p.owner || undefined,
      dueDate: normalizedDueDate,
      completed: false,
      source: 'user',
      createdAt: new Date().toISOString(),
    });

    // Schedule OS reminder if requested
    if (p.reminderDateTime) {
      const reminderOk = await reminderService.schedule({
        todoId,
        meetingId: p.meetingId,
        todoText: p.text,
        meetingTitle: p.meetingTitle,
        reminderDateTime: p.reminderDateTime,
      });
      if (!reminderOk) {
        console.warn('[TodoProposalStore] Reminder scheduling failed for:', p.text);
      }
    }
  } else if (p.action === 'toggle' && p.matchedTodoId) {
    // Read current state to toggle
    const todos = await store.todos.listForMeeting(p.meetingId);
    const todo = todos.find(t => t.id === p.matchedTodoId);
    if (todo) {
      await store.todos.setCompleted(p.matchedTodoId, !todo.completed);
    } else {
      throw new Error('Todo not found');
    }
  } else if (p.action === 'update' && p.matchedTodoId) {
    await store.todos.upsert({
      id: p.matchedTodoId,
      meetingId: p.meetingId,
      text: p.text,
      owner: p.owner || undefined,
      dueDate: p.dueDate ? normalizeDueDate(p.dueDate) : undefined,
    });
  } else if (p.action === 'delete' && p.matchedTodoId) {
    await store.todos.delete(p.matchedTodoId);
  }
}

/** Hook to subscribe to proposals state. */
export function useTodoProposals(): TodoProposal[] {
  return useSyncExternalStore(
    todoProposalStore.subscribe,
    todoProposalStore.getSnapshot,
    todoProposalStore.getSnapshot,
  );
}

/** @deprecated Use useTodoProposals() — kept for backward compat during transition */
export function useTodoProposal(): TodoProposal | null {
  const all = useTodoProposals();
  return all.length > 0 ? all[0] : null;
}
