/** A meeting or a chat previewed in Knowledge's pane, without leaving: a meeting's summary, a chat's conversation. Its item
 *  actions are a document's: ✦ Ask (asking about the meeting, or carrying on the chat) and Open in Meetings / Chats; both go
 *  there and leave the way back. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, MessageSquare } from 'lucide-react';
import { Icon, Surface, Text } from '@shared/ui';
import { ItemActions, LoadingPane, Markdown } from '@shared/components';
import { useMeetingResult } from '@shared/hooks/useMeetingResult';
import { queryKeys } from '@shared/query/queryKeys';
import { startCreate } from '@shared/stores/createStore';
import { messageText } from '@shared/utils/chatParts';
import { formatDayLabel } from '@shared/utils/formatters';
import { chatService } from '@services/chat.service';
import { openChat } from '@features/chat';
import { useOpenMeeting } from '@features/history';
import { MEETING_GLYPH } from '@config/meetingPhase.config';
import { LAYOUT } from '@config/layout.config';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import type { ConversationSource } from '@features/knowledge/hooks/useKnowledgeSources';
import { goFromKnowledge } from '@features/knowledge/goElsewhere';

const COPY = KNOWLEDGE_LIBRARY.preview;

const MeetingSummary: React.FC<{ id: string }> = ({ id }) => {
  const { result, loading } = useMeetingResult(id);
  if (loading) return <LoadingPane />;
  return result?.summary ? <Markdown content={result.summary} /> : <Text as="p" variant="helper" tone="muted">{COPY.noSummary}</Text>;
};

const ChatConversation: React.FC<{ id: string }> = ({ id }) => {
  const { data: session, isPending } = useQuery({ queryKey: queryKeys.chatConversation(id), queryFn: () => chatService.loadSession(id) });
  if (isPending) return <LoadingPane />;
  return (
    <div className="flex flex-col gap-4">
      {(session?.messages ?? []).filter((m) => messageText(m).trim()).map((message) => (
        <div key={message.id} className="space-y-1">
          <Text as="p" variant="label" tone="muted">{message.role === 'user' ? COPY.you : COPY.roci}</Text>
          {message.role === 'user'
            ? <Surface variant="inset" radius="lg" className="px-3 py-2"><Text as="p" variant="body">{messageText(message)}</Text></Surface>
            : <Markdown content={messageText(message)} />}
        </div>
      ))}
    </div>
  );
};

export const ConversationPreview: React.FC<{ source: ConversationSource }> = ({ source }) => {
  const openMeeting = useOpenMeeting();
  const meeting = source.kind === 'meeting';
  const open = () => goFromKnowledge(() => (meeting ? void openMeeting({ id: source.id }) : openChat(source.id)));
  const ask = () => goFromKnowledge(() => {
    if (!meeting) return openChat(source.id);
    void openMeeting({ id: source.id });
    startCreate('chat', source.id);
  });
  const actions = (placement: 'header' | 'bottom') => (
    <ItemActions
      placement={placement}
      onAsk={ask}
      actions={[{ icon: ArrowUpRight, label: meeting ? COPY.openMeeting : COPY.openChat, onPress: open }]}
    />
  );
  return (
    <article className="flex h-full flex-col">
      <Surface as="header" edge="bottom" className={`flex items-center gap-2 ${LAYOUT.listGutter} py-3`}>
        <Icon icon={meeting ? MEETING_GLYPH : MessageSquare} size="sm" tone="muted" />
        <div className="min-w-0 flex-1">
          <Text as="h2" variant="title" truncate>{source.title}</Text>
          <Text variant="helper" tone="muted">{formatDayLabel(source.at)}</Text>
        </div>
        {actions('header')}
      </Surface>
      <div className={`min-h-0 flex-1 overflow-y-auto ${LAYOUT.listGutter} py-4`}>
        {meeting ? <MeetingSummary id={source.id} /> : <ChatConversation id={source.id} />}
      </div>
      {actions('bottom')}
    </article>
  );
};
