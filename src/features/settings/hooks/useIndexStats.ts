/** Settings › Storage › Search Index: how many meetings and chats are indexed (have pieces), against how many there are. */

import { useQuery } from '@tanstack/react-query';
import { store } from '@services/db';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';

export interface IndexStats {
  meetings: { indexed: number; onDisk: number };
  chats: { indexed: number; onDisk: number };
  pieces: { transcript: number; chat: number };
}

async function loadIndexStats(): Promise<IndexStats> {
  const [stats, counts] = await Promise.all([store.indexStats(), store.items.count()]);
  return {
    meetings: { indexed: stats.indexed_meetings, onDisk: counts.meetings },
    chats: { indexed: stats.indexed_chats, onDisk: counts.chats },
    pieces: { transcript: stats.transcript_pieces, chat: stats.chat_pieces },
  };
}

export function useIndexStats() {
  return useQuery({ queryKey: queryKeys.indexStats(), queryFn: loadIndexStats, enabled: isTauriEnvironment() });
}
