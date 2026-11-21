/** Knowledge domain — the graph's entities (people, organizations, projects, events, topics) across meetings and memory. */

import { call } from '@services/db/internal';
import type { EntityDetail, EntityHit, GraphView } from '@shared/types/native';

export const knowledge = {
  /** Entities whose name contains `query` (all when empty), most discussed first. */
  async find(query: string, limit: number): Promise<EntityHit[]> {
    return call<EntityHit[]>('knowledge_find', { query, limit });
  },

  /** Everything about one entity: approved facts, relations, the meetings that discussed it (newest first). */
  async entity(id: string): Promise<EntityDetail | null> {
    return call<EntityDetail | null>('knowledge_entity', { id });
  },

  /** The graph to draw: two links around `focus`, or the `limit` most central nodes; ranked (PageRank) and grouped (Louvain). */
  async graph(focus: string | null, limit: number): Promise<GraphView> {
    return call<GraphView>('knowledge_graph', { focus, limit });
  },
};
