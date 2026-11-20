/** The search index as the webview uses it. Rust indexes meetings and chats as they're saved (their pieces and vectors never
 *  come here); the webview searches, adds a recording's new stretches, and asks for a rebuild. */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '@services/tauri';

export interface MeetingSearchResult {
  meetingId: string;
  meetingTitle: string;
  chunkText: string;
  chunkType: string;
  score: number;
  timestamp: number;
}

export interface ChatSearchResult {
  sessionId: string;
  sessionTitle: string;
  chunkText: string;
  chunkType: string;
  score: number;
  lastMessageAt: number;
}

interface MeetingHit { meeting_id: string; meeting_title: string; chunk_text: string; chunk_type: string; score: number; created_at: number }
interface ChatHit { chat_id: string; chat_title: string; chunk_text: string; chunk_type: string; score: number; last_message_at: number }

const toMeeting = (hit: MeetingHit): MeetingSearchResult => ({
  meetingId: hit.meeting_id,
  meetingTitle: hit.meeting_title,
  chunkText: hit.chunk_text,
  chunkType: hit.chunk_type,
  score: hit.score,
  timestamp: hit.created_at,
});

/** Meetings matching `query` by meaning and words, best first; within `meetingIds` when given. */
export async function searchMeetings(query: string, limit: number, meetingIds?: string[]): Promise<MeetingSearchResult[]> {
  if (!isTauriEnvironment()) return [];
  return (await invoke<MeetingHit[]>('search_meetings', { query, limit, meetingIds })).map(toMeeting);
}

/** Several queries within one meeting (live notes recalling what was said), each query's hits. */
export async function searchMeetingWithin(meetingId: string, queries: string[], limit: number): Promise<MeetingSearchResult[][]> {
  if (!isTauriEnvironment() || queries.length === 0) return [];
  return (await invoke<MeetingHit[][]>('search_meeting_within', { meetingId, queries, limit })).map((hits) => hits.map(toMeeting));
}

/** Chats matching `query` by meaning and words, best first. */
export async function searchChats(query: string, limit: number): Promise<ChatSearchResult[]> {
  if (!isTauriEnvironment()) return [];
  const hits = await invoke<ChatHit[]>('search_chats', { query, limit });
  return hits.map((hit) => ({
    sessionId: hit.chat_id,
    sessionTitle: hit.chat_title,
    chunkText: hit.chunk_text,
    chunkType: hit.chunk_type,
    score: hit.score,
    lastMessageAt: hit.last_message_at,
  }));
}

/** A recording's new stretch of transcript, indexed as it's spoken; resolves the piece texts it added. */
export async function indexStretch(meetingId: string, text: string): Promise<string[]> {
  if (!isTauriEnvironment()) return [];
  return invoke<string[]>('index_stretch', { meetingId, text });
}

export type RebuildScope = 'all' | 'meetings' | 'chats';

/** Clears `scope`'s index and indexes everything in it again; resolves when done. */
export async function rebuildSearchIndex(scope: RebuildScope): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke('rebuild_search_index', { scope });
}

/** A rebuild's progress: which kind and how far, then `done`. */
export interface IndexProgress {
  kind: 'meetings' | 'chats' | null;
  current: number;
  total: number;
  done: boolean;
}

export async function onIndexProgress(listener: (progress: IndexProgress) => void): Promise<UnlistenFn> {
  if (!isTauriEnvironment()) return () => undefined;
  return listen<IndexProgress>('search-index://progress', ({ payload }) => listener(payload));
}
