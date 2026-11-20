/** The store's search reads the webview still makes itself: index stats (Settings) and the ⌘K session search. */

import { invoke } from '@tauri-apps/api/core';

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
  async getStats(): Promise<DbStats> {
    await ensureInitialized();
    return invoke('plugin:store|get_stats');
  },

  async searchSessions(params: SessionSearchParams): Promise<SessionSearchHit[]> {
    await ensureInitialized();
    return invoke('plugin:store|search_sessions', { params });
  },
};
