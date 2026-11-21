/** The saved memories (with the entities they are about) and their edits: each edit shows at once (optimistic) and rolls back
 *  if the save fails. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { store } from '@services/db';
import { memoriesQuery } from '@shared/query/memories';
import type { MemoryGraph, MemoryInput, MemoryRow } from '@shared/types/native';

const EMPTY: MemoryGraph = { entities: [], memories: [] };
const { queryKey } = memoriesQuery;

/** A mutation whose change shows before the store answers. */
function useOptimistic<V>(mutationFn: (vars: V) => Promise<unknown>, change: (graph: MemoryGraph, vars: V) => MemoryGraph) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MemoryGraph>(queryKey);
      queryClient.setQueryData<MemoryGraph>(queryKey, (old) => change(old ?? EMPTY, vars));
      return { previous };
    },
    onError: (error: unknown, _vars, context) => {
      console.error('[useMemories] Save failed:', error);
      queryClient.setQueryData(queryKey, context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

/** The memory as it shows until the store answers (a new entity appears with the store's answer). */
function shown(input: MemoryInput, graph: MemoryGraph): MemoryRow {
  const existing = graph.memories.find((m) => m.id === input.id);
  // The store's rule: one entity per kind and name, in any case.
  const about = input.about;
  const entity = about && graph.entities.find((e) => e.entity_type === about.entity_type && e.name.toLowerCase() === about.name.trim().toLowerCase());
  const now = Date.now();
  return {
    id: input.id ?? crypto.randomUUID(),
    text: input.text.trim(),
    source: existing?.source ?? input.source,
    entity_id: entity ? entity.id : null,
    pinned: input.pinned,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

export function useMemories() {
  const { data = EMPTY, isLoading } = useQuery(memoriesQuery);
  const save = useOptimistic(
    (memory: MemoryInput) => store.memories.upsert(memory),
    (graph, memory) => ({ ...graph, memories: [shown(memory, graph), ...graph.memories.filter((m) => m.id !== memory.id)] }),
  );
  const remove = useOptimistic(
    (id: string) => store.memories.delete(id),
    (graph, id) => ({ ...graph, memories: graph.memories.filter((m) => m.id !== id) }),
  );
  const removeAll = useOptimistic(() => store.memories.deleteAll(), () => EMPTY);
  return {
    graph: data,
    memories: data.memories,
    entities: data.entities,
    isLoading,
    save: save.mutate,
    remove: remove.mutate,
    removeAll: () => removeAll.mutate(undefined),
  };
}
