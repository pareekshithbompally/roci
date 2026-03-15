/**
 * Vector DB Client
 *
 * Thin wrapper around Tauri invoke calls to the vectordb Rust plugin.
 * All vector storage and search happens in the Rust backend (sqlite-vec).
 */

import { invoke } from '@tauri-apps/api/core';

export interface MeetingMeta {
  id: string;
  title: string;
  timestamp: number;
  summary: string | null;
  categories: string | null;
  content_hash: string;
}

export interface ChunkData {
  chunk_index: number;
  chunk_text: string;
  chunk_type: string;
  embedding: number[];
  start_pos: number | null;
  end_pos: number | null;
}

export interface SearchParams {
  embedding: number[];
  query_text: string;
  limit: number;
  mode?: 'hybrid' | 'vector' | 'fulltext';
}

export interface SearchHit {
  meeting_id: string;
  meeting_title: string;
  chunk_text: string;
  chunk_type: string;
  score: number;
  timestamp: number;
}

export interface MeetingHash {
  id: string;
  content_hash: string;
}

export interface DbStats {
  total_meetings: number;
  total_chunks: number;
  db_size_bytes: number;
}

export interface DbMeta {
  schema_version: string;
  embedding_model: string;
  embedding_dim: string;
}

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = invoke('plugin:vectordb|initialize').then(
      () => {},
      (err) => { initPromise = null; throw err; }  // Reset on failure so retry works
    );
  }
  return initPromise;
}

export const vectorDB = {
  initialize: ensureInitialized,

  async upsertMeeting(meeting: MeetingMeta): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:vectordb|upsert_meeting', { meeting });
  },

  async upsertChunks(meetingId: string, chunks: ChunkData[]): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:vectordb|upsert_chunks', { meetingId, chunks });
  },

  async deleteMeeting(meetingId: string): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:vectordb|delete_meeting', { meetingId });
  },

  async search(params: SearchParams): Promise<SearchHit[]> {
    await ensureInitialized();
    return invoke('plugin:vectordb|search', { params });
  },

  async getStaleMeetings(meetings: MeetingHash[]): Promise<string[]> {
    await ensureInitialized();
    return invoke('plugin:vectordb|get_stale_meetings', { meetings });
  },

  async getIndexedIds(): Promise<string[]> {
    await ensureInitialized();
    return invoke('plugin:vectordb|get_indexed_ids');
  },

  async getStats(): Promise<DbStats> {
    await ensureInitialized();
    return invoke('plugin:vectordb|get_stats');
  },

  async getMeta(): Promise<DbMeta> {
    await ensureInitialized();
    return invoke('plugin:vectordb|get_meta');
  },

  async rebuild(): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:vectordb|rebuild');
  },
};
