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
};
