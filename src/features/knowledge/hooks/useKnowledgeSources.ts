/** The meetings and chats Knowledge lists under the documents (what Roci already reads), newest first, narrowed to those
 *  whose title has `query`, each with how far indexing it has got (read again as Rust reports each change). */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { store, type SourceKind } from '@services/db';
import { isTauriEnvironment } from '@services/tauri';
import { queryKeys } from '@shared/query/queryKeys';
import type { SourceStatus } from '@shared/types/native';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';

/** A meeting or chat as a Knowledge row. */
export interface ConversationSource {
  kind: 'meeting' | 'chat';
  id: string;
  title: string;
  /** Epoch ms: when the meeting was, or the chat's last message. */
  at: number;
  status: SourceStatus | undefined;
}

function useStates(kind: SourceKind) {
  const { data = [] } = useQuery({ queryKey: queryKeys.sourceStates(kind), queryFn: () => store.sources.states(kind), enabled: isTauriEnvironment() });
  return useMemo(() => new Map(data.map((status) => [status.owner_id, status])), [data]);
}

function useConversations(kind: 'meeting' | 'chat'): Omit<ConversationSource, 'status'>[] {
  const { data = [] } = useQuery({
    queryKey: queryKeys.knowledgeSources(kind),
    queryFn: async () => {
      const entries = await store.items.page(null, KNOWLEDGE_LIBRARY.conversationLimit, { kind });
      return entries.map((entry) =>
        entry.kind === 'meeting'
          ? { kind: 'meeting' as const, id: entry.meeting.id, title: entry.meeting.title, at: Date.parse(entry.meeting.createdAt) }
          : { kind: 'chat' as const, id: entry.chat.id, title: entry.chat.title, at: entry.chat.lastMessageAt },
      );
    },
    enabled: isTauriEnvironment(),
  });
  return data;
}

export function useKnowledgeSources(query: string) {
  const meetings = useConversations('meeting');
  const chats = useConversations('chat');
  const meetingStates = useStates('meeting');
  const chatStates = useStates('chat');
  return useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const shown = (sources: Omit<ConversationSource, 'status'>[], states: Map<string, SourceStatus>) =>
      sources
        .filter((source) => !needle || source.title.toLocaleLowerCase().includes(needle))
        .map((source) => ({ ...source, status: states.get(source.id) }));
    return { meetings: shown(meetings, meetingStates), chats: shown(chats, chatStates), hasAny: meetings.length + chats.length > 0 };
  }, [query, meetings, chats, meetingStates, chatStates]);
}
