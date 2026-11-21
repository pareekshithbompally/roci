/** Memories domain — the graph (entities and memories), save one memory (new or edited), delete one, delete all. */

import { call } from '@services/db/internal';
import type { MemoryGraph, MemoryInput, MemoryRow } from '@shared/types/native';

export const memories = {
  /** Every entity and memory, in display order. */
  async graph(): Promise<MemoryGraph> {
    return call<MemoryGraph>('memory_graph');
  },

  /** Save a new memory (no id) or an edit of one; `about` names its entity (found by name, created when new). */
  async upsert(memory: MemoryInput): Promise<MemoryRow> {
    return call<MemoryRow>('memories_upsert', { memory });
  },

  async delete(id: string): Promise<void> {
    await call<void>('memories_delete', { id });
  },

  /** Forgets everything: memories and their entities. */
  async deleteAll(): Promise<void> {
    await call<void>('memories_delete_all');
  },
};
