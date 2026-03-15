/**
 * Knowledge Graph Types
 *
 * Single source of truth for entity and relationship types.
 * Rust backend mirrors these as string constants in graph.rs.
 */

// ── Entity Types ──

export const ENTITY_TYPES = {
  PERSON: 'person',
  MEETING: 'meeting',
  TOPIC: 'topic',
  DECISION: 'decision',
  ACTION_ITEM: 'action_item',
  PROJECT: 'project',
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];

// ── Relationship Types ──

export const RELATIONSHIP_TYPES = {
  ATTENDED: 'attended',
  DISCUSSED: 'discussed',
  PRODUCED_DECISION: 'produced_decision',
  PRODUCED_ACTION: 'produced_action',
  ASSIGNED_TO: 'assigned_to',
  AFFECTS: 'affects',
  WORKS_ON: 'works_on',
  RELATED_TO: 'related_to',
  FOLLOW_UP_TO: 'follow_up_to',
  MENTIONED_BY: 'mentioned_by',
} as const;

export type RelationshipType = typeof RELATIONSHIP_TYPES[keyof typeof RELATIONSHIP_TYPES];

// ── Data Structures ──

export interface GraphNode {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  type: RelationshipType;
  properties?: Record<string, unknown>;
  meeting_id: string;
  created_at: number;
}

export interface GraphUpsertPayload {
  meeting_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Query Types ──

export interface TraversalParams {
  start_node_id: string;
  edge_types?: string[];
  target_node_types?: string[];
  max_depth: number;
  direction?: 'outgoing' | 'incoming' | 'both';
  limit?: number;
}

export interface TraversalResult {
  node: GraphNode;
  path_depth: number;
  via_edge_type: string;
  via_meeting_id?: string;
}

export interface GraphSearchParams {
  query: string;
  node_types?: string[];
  limit?: number;
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  nodes_by_type: Record<string, number>;
  edges_by_type: Record<string, number>;
}
