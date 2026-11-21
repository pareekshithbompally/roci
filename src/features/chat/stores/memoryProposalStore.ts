/** Memories the AI proposed in chat, waiting on the card above the chat box: nothing is saved until the user approves. One
 *  proposal at a time per chat; one the user dismissed is not proposed again this session. */

import { store } from '@services/db';
import { queryClient } from '@shared/query/queryClient';
import { memoriesQuery } from '@shared/query/memories';
import type { EntityRef, MemoryGraph } from '@shared/types/native';
import { createProposalQueue, type Proposal } from '@features/chat/stores/proposalQueue';

export interface MemoryProposal extends Proposal {
  action: 'create' | 'update' | 'forget';
  /** The memory it changes (update, forget); null when creating. */
  memoryId: string | null;
  /** That memory's text before the change, shown on the card (update, forget). */
  originalText: string | null;
  /** The text to save (the user may edit it first). */
  text: string;
  /** The person, organization, project, event or topic it is about; none = the user (or, for an update, what it was about). */
  about: EntityRef | null;
}

/** Texts dismissed this session, compared without case, so the AI doesn't ask again. */
const dismissed = new Set<string>();
const key = (text: string) => text.trim().toLowerCase();

/** What an existing memory is about, as the store takes it. */
function entityOf(graph: MemoryGraph, entityId: string | null): EntityRef | null {
  const entity = graph.entities.find((e) => e.id === entityId);
  return entity ? { name: entity.name, entity_type: entity.entity_type } : null;
}

/** Writes one approved proposal through the store; a correction keeps its memory's source, pin and subject (the store
 *  refuses one whose memory was deleted meanwhile). */
async function commit(p: MemoryProposal): Promise<void> {
  if (p.action === 'forget') return p.memoryId ? store.memories.delete(p.memoryId) : undefined;
  const graph = await queryClient.fetchQuery(memoriesQuery);
  const saved = graph.memories.find((m) => m.id === p.memoryId);
  await store.memories.upsert({
    id: p.memoryId,
    text: p.text,
    source: saved?.source ?? 'chat',
    about: p.about ?? entityOf(graph, saved?.entity_id ?? null),
    pinned: saved?.pinned ?? false,
  });
}

const queue = createProposalQueue<MemoryProposal>('MemoryProposalStore', commit, () => {
  void queryClient.invalidateQueries({ queryKey: memoriesQuery.queryKey });
});

export const memoryProposalStore = {
  propose: queue.propose,
  commitAll: queue.commitAll,

  /** A proposal still waiting in this chat, if any. */
  pendingIn(chatId: string | null): MemoryProposal | undefined {
    return queue.in(chatId).find((p) => p.status === 'pending');
  },

  wasDismissed(text: string): boolean {
    return dismissed.has(key(text));
  },

  edit(id: string, text: string): void {
    queue.edit(id, { text });
  },

  remove(id: string): void {
    const removed = queue.remove(id);
    if (removed) dismissed.add(key(removed.text));
  },

  cancelAll(chatId: string | null): void {
    queue.in(chatId).forEach((p) => dismissed.add(key(p.text)));
    queue.cancelAll(chatId);
  },
};

export const useMemoryProposals = queue.useProposals;
