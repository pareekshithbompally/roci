/** Thin wrapper over the store plugin's invoke calls; storage and search run in Rust (sqlite-vec). */

import { invoke } from '@tauri-apps/api/core';

export interface MeetingMeta {
  id: string;
  title: string;
  created_at: number;
  summary: string | null;
  categories: string | null;
  content_hash?: string;
}

export interface ChunkData {
  chunk_index: number;
  chunk_text: string;
  chunk_type: string;
  embedding?: number[];
  start_pos: number | null;
  end_pos: number | null;
}

export interface SearchParams {
  embedding: number[];
  query_text: string;
  limit: number;
  mode?: 'hybrid' | 'vector' | 'fulltext';
  meeting_ids?: string[];
}

export interface SearchHit {
  meeting_id: string;
  meeting_title: string;
  chunk_text: string;
  chunk_type: string;
  score: number;
  created_at: number;
}

export interface MeetingHash {
  id: string;
  content_hash: string;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  last_message_at: number;
  message_count: number;
  content_hash?: string;
}

export interface ChatChunkData {
  chunk_index: number;
  chunk_text: string;
  chunk_type: string;
  embedding?: number[];
}

export interface ChatSearchParams {
  embedding: number[];
  query_text: string;
  limit: number;
  mode?: 'hybrid' | 'vector' | 'fulltext';
}

export interface ChatSearchHit {
  chat_id: string;
  chat_title: string;
  chunk_text: string;
  chunk_type: string;
  score: number;
  last_message_at: number;
}

export interface SessionSearchParams {
  query: string;
  /** Max results per source type. Total results ≤ limit × 2. */
  limit: number;
}

export interface SessionSearchHit {
  source_type: 'meeting' | 'chat';
  source_id: string;
  title: string;
  /** Excerpt with <<MARK>> / <</MARK>> around matched terms; empty for title-only matches. */
  excerpt: string;
  timestamp: number;
  match_type: 'title' | 'content';
}

export interface DbStats {
  total_meetings: number;
  total_chunks: number;
  transcript_chunks: number;
  chat_sessions: number;
  chat_chunks: number;
  db_size_bytes: number;
  fts_chunks: number;
  fts_chat_chunks: number;
}

export interface DbMeta {
  schema_version: string;
  embedding_model: string;
  embedding_dim: string;
}

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = invoke('plugin:store|initialize').then(
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
    await invoke('plugin:store|upsert_meeting_index', { meeting });
  },

  async upsertChunks(meetingId: string, chunks: ChunkData[]): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|upsert_chunks', { meetingId, chunks });
  },

  /** Adds chunks after the meeting's last one, keeping what is there (a meeting indexed while it records). */
  async appendChunks(meetingId: string, chunks: ChunkData[]): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|append_chunks', { meetingId, chunks });
  },

  async search(params: SearchParams): Promise<SearchHit[]> {
    await ensureInitialized();
    return invoke('plugin:store|meetings_search', { params });
  },

  async getStaleMeetings(meetings: MeetingHash[]): Promise<string[]> {
    await ensureInitialized();
    return invoke('plugin:store|get_stale_meetings', { meetings });
  },

  async getMeetingsNeedingEmbeddings(meetingIds: string[]): Promise<string[]> {
    await ensureInitialized();
    return invoke('plugin:store|get_meetings_needing_embeddings', { meetingIds });
  },

  async markMeetingEmbedded(meetingId: string): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|mark_meeting_embedded', { meetingId });
  },

  async getIndexedIds(): Promise<string[]> {
    await ensureInitialized();
    return invoke('plugin:store|get_indexed_ids');
  },

  async getStats(): Promise<DbStats> {
    await ensureInitialized();
    return invoke('plugin:store|get_stats');
  },

  async getMeta(): Promise<DbMeta> {
    await ensureInitialized();
    return invoke('plugin:store|get_meta');
  },

  async rebuild(): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|rebuild');
  },

  /** Record chat RAG staleness only. The canonical `chats` row is owned by chats_upsert. */
  async markChatIndexed(session: ChatSessionMeta): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|mark_chat_indexed', { session });
  },

  async upsertChatChunks(sessionId: string, chunks: ChatChunkData[]): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|upsert_chat_chunks', { sessionId, chunks });
  },

  async isChatSessionStale(sessionId: string, contentHash: string): Promise<boolean> {
    await ensureInitialized();
    return invoke('plugin:store|chat_is_stale', { sessionId, contentHash });
  },

  async getStaleChatSessions(sessions: MeetingHash[]): Promise<string[]> {
    await ensureInitialized();
    return invoke('plugin:store|chats_get_stale', { sessions });
  },

  async getChatsNeedingEmbeddings(sessionIds: string[]): Promise<string[]> {
    await ensureInitialized();
    return invoke('plugin:store|get_chats_needing_embeddings', { sessionIds });
  },

  async markChatEmbedded(sessionId: string): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|mark_chat_embedded', { sessionId });
  },

  async markMeetingContentIndexed(meetingId: string, contentHash: string): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|mark_meeting_content_indexed', { meetingId, contentHash });
  },

  async markChatContentIndexed(sessionId: string, contentHash: string): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|mark_chat_content_indexed', { sessionId, contentHash });
  },

  async rebuildFts(): Promise<void> {
    await ensureInitialized();
    await invoke('plugin:store|rebuild_fts');
  },

  async searchChats(params: ChatSearchParams): Promise<ChatSearchHit[]> {
    await ensureInitialized();
    return invoke('plugin:store|chats_search', { params });
  },

  async searchSessions(params: SessionSearchParams): Promise<SessionSearchHit[]> {
    await ensureInitialized();
    return invoke('plugin:store|search_sessions', { params });
  },
};
