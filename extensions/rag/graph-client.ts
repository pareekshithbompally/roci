/**
 * Knowledge Graph Client
 *
 * Thin wrapper around Tauri invoke calls to graph commands
 * in the vectordb Rust plugin. Same pattern as client.ts.
 */

import { invoke } from '@tauri-apps/api/core';
import { vectorDB } from './client';
import type {
  GraphNode, GraphEdge, GraphUpsertPayload,
  TraversalParams, TraversalResult,
  GraphSearchParams, GraphStats,
} from './graph-types';

export const graphDB = {
  async upsert(payload: GraphUpsertPayload): Promise<void> {
    await vectorDB.initialize();
    await invoke('plugin:vectordb|graph_upsert', {
      meetingId: payload.meeting_id,
      nodes: payload.nodes,
      edges: payload.edges,
    });
  },

  async traverse(params: TraversalParams): Promise<TraversalResult[]> {
    await vectorDB.initialize();
    return invoke('plugin:vectordb|graph_traverse', { params });
  },

  async neighbors(
    nodeId: string,
    edgeTypes?: string[],
    direction?: 'outgoing' | 'incoming' | 'both',
  ): Promise<TraversalResult[]> {
    await vectorDB.initialize();
    return invoke('plugin:vectordb|graph_neighbors', { nodeId, edgeTypes, direction });
  },

  async search(params: GraphSearchParams): Promise<GraphNode[]> {
    await vectorDB.initialize();
    return invoke('plugin:vectordb|graph_search', { params });
  },

  async deleteMeeting(meetingId: string): Promise<void> {
    await vectorDB.initialize();
    await invoke('plugin:vectordb|graph_delete_meeting', { meetingId });
  },

  async stats(): Promise<GraphStats> {
    await vectorDB.initialize();
    return invoke('plugin:vectordb|graph_stats');
  },

  /**
   * Find all meetings that belong to a specific category
   */
  async findMeetingsByCategory(category: string, limit = 10): Promise<GraphNode[]> {
    await vectorDB.initialize();
    return this.traverse({
      start_node_id: `category:${category.toLowerCase()}`,
      edge_types: ['belongs_to_category'],
      target_node_types: ['meeting'],
      max_depth: 1,
      direction: 'incoming',
      limit,
    });
  },

  /**
   * Find all categories in the graph
   */
  async findAllCategories(limit = 50): Promise<GraphNode[]> {
    await vectorDB.initialize();
    return this.search({
      node_types: ['category'],
      limit,
    });
  },

  /**
   * Get all meetings and their categories
   */
  async findMeetingsWithCategories(limit = 20): Promise<{
    meeting: GraphNode;
    categories: GraphNode[];
  }[]> {
    await vectorDB.initialize();
    
    // 1. Find all category nodes
    const categories = await this.findAllCategories();
    
    // 2. For each category, find meetings that belong to it
    const result: { meeting: GraphNode; categories: GraphNode[] }[] = [];
    const meetingMap = new Map<string, { meeting: GraphNode; categories: GraphNode[] }>();
    
    for (const category of categories) {
      const meetings = await this.traverse({
        start_node_id: category.id,
        edge_types: ['belongs_to_category'],
        target_node_types: ['meeting'],
        max_depth: 1,
        direction: 'outgoing',
        limit,
      });
      
      for (const traversal of meetings) {
        if (!meetingMap.has(traversal.node.id)) {
          meetingMap.set(traversal.node.id, {
            meeting: traversal.node,
            categories: [category],
          });
        } else {
          meetingMap.get(traversal.node.id)?.categories.push(category);
        }
      }
    }
    
    return Array.from(meetingMap.values());
  },
};
