/** How memories read: a memory's subject as a label, and each memory as the line a model reads. */

import type { MemoryEntityRow, MemoryGraph, MemoryRow } from '@shared/types/native';

/** "Priya Raman (person)" for a memory about an entity; none for one about the user. */
export function aboutLabel(memory: MemoryRow, entities: readonly MemoryEntityRow[]): string | undefined {
  const entity = entities.find((e) => e.id === memory.entity_id);
  return entity && `${entity.name} (${entity.entity_type})`;
}

/** Each memory as one line the model reads: its id, what it is about, the fact. */
export function memoryLines({ memories, entities }: MemoryGraph): Array<{ id: string; text: string }> {
  return memories.map((m) => {
    const about = aboutLabel(m, entities);
    return { id: m.id, text: about ? `${about}: ${m.text}` : m.text };
  });
}
