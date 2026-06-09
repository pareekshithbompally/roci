/**
 * Core TypeScript types for the unified store client.
 *
 * All domain types consumed by features are defined in src/shared/types/.
 * This file defines only the store-layer pagination/result shapes.
 */

/** Paginated list result — every `*_list` command returns this shape. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

/** Map of settings key → value. */
export type SettingsMap = Record<string, unknown>;

/** Store health probe result. */
export interface StoreMeta {
  schema_version: string;
  embedding_model: string;
  embedding_dim: string;
}

/** Store statistics. */
export interface StoreStats {
  total_meetings: number;
  total_chunks: number;
  transcript_chunks: number;
  chat_sessions: number;
  chat_chunks: number;
  kg_nodes: number;
  kg_edges: number;
  db_size_bytes: number;
  fts_chunks: number;
  fts_chat_chunks: number;
}
