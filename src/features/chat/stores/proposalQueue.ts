/** A queue of changes the AI proposed in chat, waiting on the card above that chat's box: nothing is saved until the user
 *  approves, each proposal shows only in the chat it was proposed in, and a saved one shows as saved for a moment before
 *  it goes (a failed one stays, with its error, until dismissed). To-dos and memories are one queue each. */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { UI_CONFIG } from '@config/ui.config';
import { errorMessage } from '@shared/utils/errors';
import type { ProposalItem } from '@shared/components';

/** What every proposal carries; each queue adds the fields of what it changes. */
export interface Proposal {
  id: string;
  /** The chat it was proposed in (not saved with the change). */
  chatId: string | null;
  status: 'pending' | 'committing' | 'committed' | 'error';
  error?: string;
}

/** How the shared proposal card shows each status. */
export const PROPOSAL_STATE: Record<Proposal['status'], ProposalItem['state']> = {
  pending: 'pending',
  committing: 'saving',
  committed: 'saved',
  error: 'error',
};

/** A queue whose approved proposals are written by `commit`; `settled` runs once a batch is written (to read again). */
export function createProposalQueue<P extends Proposal>(name: string, commit: (p: P) => Promise<void>, settled: () => void) {
  const useStore = create<{ proposals: P[] }>(() => ({ proposals: [] }));
  const all = () => useStore.getState().proposals;
  const set = (next: P[]) => useStore.setState({ proposals: next });
  const mark = (id: string, change: Partial<P>) => set(all().map((p) => (p.id === id ? { ...p, ...change } : p)));
  const inChat = (chatId: string | null) => all().filter((p) => p.chatId === chatId);

  async function commitOne(p: P): Promise<void> {
    try {
      await commit(p);
      mark(p.id, { status: 'committed' } as Partial<P>);
    } catch (error: unknown) {
      console.error(`[${name}] Save failed:`, error);
      mark(p.id, { status: 'error', error: errorMessage(error) } as Partial<P>);
    }
  }

  return {
    propose(p: Omit<P, 'id' | 'status'>): void {
      set([...all(), { ...p, id: crypto.randomUUID(), status: 'pending' } as P]);
    },

    /** The proposals in this chat, in the order proposed. */
    in: inChat,

    /** The user's edit of a proposal still waiting. */
    edit(id: string, change: Partial<Omit<P, keyof Proposal>>): void {
      set(all().map((p) => (p.id === id && p.status === 'pending' ? { ...p, ...change } : p)));
    },

    /** Drops one proposal unsaved; returns it. */
    remove(id: string): P | undefined {
      const removed = all().find((p) => p.id === id);
      set(all().filter((p) => p.id !== id));
      return removed;
    },

    /** Saves this chat's waiting proposals, and retries failed ones, one after another. */
    async commitAll(chatId: string | null): Promise<void> {
      const pending = inChat(chatId).filter((p) => p.status === 'pending' || p.status === 'error');
      pending.forEach((p) => mark(p.id, { status: 'committing', error: undefined } as Partial<P>));
      for (const p of pending) await commitOne(p);
      settled();
      setTimeout(() => set(all().filter((p) => p.status !== 'committed')), UI_CONFIG.activityTray.settleDelay);
    },

    /** Drops this chat's proposals unsaved. */
    cancelAll(chatId: string | null): void {
      set(all().filter((p) => p.chatId !== chatId));
    },

    /** This chat's proposals; re-renders when they change. */
    useProposals(chatId: string | null): P[] {
      return useStore(useShallow((s) => s.proposals.filter((p) => p.chatId === chatId)));
    },
  };
}
