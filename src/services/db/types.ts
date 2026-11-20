/** Store-layer pagination and result shapes; domain types live in src/shared/types/. */

/** Paginated list result — every `*_list` command returns this shape. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

/** Map of settings key → value. */
export type SettingsMap = Record<string, unknown>;

/** The search index as Settings shows it: meetings and chats that have pieces, and how many pieces of each kind. */
export interface IndexStats {
  indexed_meetings: number;
  indexed_chats: number;
  transcript_pieces: number;
  chat_pieces: number;
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
