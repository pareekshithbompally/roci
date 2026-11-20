/** Settings › Storage › Search Index: how many meetings and chats are indexed, against how many there are. */

import { useQuery } from '@tanstack/react-query';
import { store } from '@services/db';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';

export interface IndexStats {
  meetings: { indexed: number; onDisk: number };
  chats: { indexed: number; onDisk: number };
  chunks: { total: number; transcript: number };
}

async function loadIndexStats(): Promise<IndexStats> {
  const { vectorDB } = await import('@extensions/rag');
  const [stats, counts] = await Promise.all([vectorDB.getStats(), store.items.count()]);
  return {
    meetings: { indexed: stats.total_meetings, onDisk: counts.meetings },
    chats: { indexed: stats.chat_sessions, onDisk: counts.chats },
    chunks: { total: stats.total_chunks, transcript: stats.transcript_chunks },
  };
}

export function useIndexStats() {
  return useQuery({ queryKey: queryKeys.indexStats(), queryFn: loadIndexStats, enabled: isTauriEnvironment() });
}
