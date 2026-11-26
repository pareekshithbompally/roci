/** The meetings and chats Knowledge lists under its documents: what Roci already reads, each with its indexing state's mark;
 *  a tap opens it where it lives (its meeting page, its chat). */

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Icon, Row, StateMark, Text } from '@shared/ui';
import { formatDayLabel } from '@shared/utils/formatters';
import { openChat } from '@features/chat';
import { useOpenMeeting } from '@features/history';
import { MEETING_GLYPH } from '@config/meetingPhase.config';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import type { ConversationSource } from '@features/knowledge/hooks/useKnowledgeSources';

const GLYPH = { meeting: MEETING_GLYPH, chat: MessageSquare } as const;

/** How far indexing a meeting or chat has got; nothing until the indexer has read it (one with nothing to read, like a
 *  meeting without its transcript yet, shows no state rather than one forever indexing). */
const indexingOf = (source: ConversationSource) => (source.status ? KNOWLEDGE_LIBRARY.states[source.status.state] : null);

const Section: React.FC<{ title: string; sources: ConversationSource[]; onOpen: (source: ConversationSource) => void }> = ({ title, sources, onOpen }) =>
  sources.length === 0 ? null : (
    <section>
      <Text as="h2" variant="label" tone="muted" className="px-2.5 pt-3 pb-1">{title}</Text>
      {sources.map((source) => {
        const indexing = indexingOf(source);
        return (
          <Row key={source.id} leading={<Icon icon={GLYPH[source.kind]} size="xs" tone="muted" />} onClick={() => onOpen(source)}>
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <Text as="span" truncate className="block">{source.title}</Text>
                <Text as="span" variant="helper" tone="muted" truncate className="block">{formatDayLabel(source.at)}</Text>
              </span>
              {indexing && <StateMark state={indexing.state} label={indexing.label} />}
            </span>
          </Row>
        );
      })}
    </section>
  );

export const ConversationSections: React.FC<{ meetings: ConversationSource[]; chats: ConversationSource[] }> = ({ meetings, chats }) => {
  const openMeeting = useOpenMeeting();
  const open = (source: ConversationSource) => (source.kind === 'meeting' ? void openMeeting({ id: source.id }) : openChat(source.id));
  return (
    <>
      <Section title={KNOWLEDGE_LIBRARY.sections.meetings} sources={meetings} onOpen={open} />
      <Section title={KNOWLEDGE_LIBRARY.sections.chats} sources={chats} onOpen={open} />
    </>
  );
};
