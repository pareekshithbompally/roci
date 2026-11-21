/** The knowledge graph as screens read it: the graph drawn around a meeting or entity (or whole), and one entity's detail. */

import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { UI_CONFIG } from '@config/ui.config';

export const knowledgeGraphQuery = (focus: string | null) => ({
  queryKey: queryKeys.knowledgeGraph(focus),
  queryFn: () => store.knowledge.graph(focus, UI_CONFIG.graph.maxNodes),
});

export const knowledgeEntityQuery = (id: string) => ({
  queryKey: queryKeys.knowledgeEntity(id),
  queryFn: () => store.knowledge.entity(id),
});
