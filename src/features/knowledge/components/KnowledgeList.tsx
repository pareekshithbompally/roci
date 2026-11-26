/** Knowledge's one list: documents, then meetings, then chats (as the scope shows them), every row the same shape — its mark
 *  (a file type, a meeting, a chat), its name over one line of facts, and its indexing state. A document still being saved
 *  can't be opened yet. */

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { FileTypeIcon, Icon, Row, StateMark, Text } from '@shared/ui';
import { formatDayLabel } from '@shared/utils/formatters';
import type { KnowledgeDocument } from '@services/storage';
import type { SourceStatus } from '@shared/types/native';
import type { KnowledgeSelection } from '@shared/stores/knowledgeStore';
import { MEETING_GLYPH } from '@config/meetingPhase.config';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import type { ConversationSource } from '@features/knowledge/hooks/useKnowledgeSources';
import { documentFacts, indexingOf } from './documentFacts';

interface SourceRowProps {
  leading: React.ReactNode;
  title: string;
  facts: string;
  status: SourceStatus | undefined;
  /** Documents are indexed from the moment they're added; a meeting or chat shows a state only once it was read. */
  pendingUntilRead: boolean;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const SourceRow: React.FC<SourceRowProps> = ({ leading, title, facts, status, pendingUntilRead, selected, disabled, onSelect }) => {
  const indexing = status || pendingUntilRead ? indexingOf(status) : null;
  return (
    <Row selected={selected} disabled={disabled} leading={leading} onClick={onSelect}>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <Text as="span" truncate className="block">{title}</Text>
          <Text as="span" variant="helper" tone="muted" truncate className="block">{facts}</Text>
        </span>
        {indexing && <StateMark state={indexing.state} label={indexing.label} />}
      </span>
    </Row>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode[] }> = ({ title, children }) =>
  children.length === 0 ? null : (
    <section>
      <Text as="h2" variant="label" tone="muted" className="px-2.5 pt-3 pb-1 first:pt-0">{title}</Text>
      {children}
    </section>
  );

const CONVERSATION_GLYPH = { meeting: MEETING_GLYPH, chat: MessageSquare } as const;

interface KnowledgeListProps {
  documents: KnowledgeDocument[];
  meetings: ConversationSource[];
  chats: ConversationSource[];
  statusOf: (id: string) => SourceStatus | undefined;
  selected: KnowledgeSelection | null;
  onSelect: (selection: KnowledgeSelection) => void;
}

export const KnowledgeList: React.FC<KnowledgeListProps> = ({ documents, meetings, chats, statusOf, selected, onSelect }) => {
  const isSelected = (kind: KnowledgeSelection['kind'], key: string) => selected?.kind === kind && selected.key === key;
  const conversation = (source: ConversationSource) => (
    <SourceRow
      key={source.id}
      leading={<Icon icon={CONVERSATION_GLYPH[source.kind]} size="xs" tone="muted" />}
      title={source.title}
      facts={formatDayLabel(source.at)}
      status={source.status}
      pendingUntilRead={false}
      selected={isSelected(source.kind, source.id)}
      onSelect={() => onSelect({ kind: source.kind, key: source.id })}
    />
  );
  return (
    <>
      <Section title={KNOWLEDGE_LIBRARY.documents}>
        {documents.map((document) => (
          <SourceRow
            key={document.id}
            leading={<FileTypeIcon name={document.name} />}
            title={document.name}
            facts={documentFacts(document)}
            status={statusOf(document.id)}
            pendingUntilRead
            selected={isSelected('file', document.id)}
            disabled={!document.appPath}
            onSelect={() => onSelect({ kind: 'file', key: document.id })}
          />
        ))}
      </Section>
      <Section title={KNOWLEDGE_LIBRARY.sections.meetings}>{meetings.map(conversation)}</Section>
      <Section title={KNOWLEDGE_LIBRARY.sections.chats}>{chats.map(conversation)}</Section>
    </>
  );
};
