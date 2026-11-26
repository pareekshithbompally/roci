/** A document's Related: the meetings, chats and other documents about the same thing, found by meaning on the device (no
 *  model call), best first; tapping one opens it where it lives. Nothing shows until the document is indexed, or when none
 *  is close enough. */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardRow, Section } from '@shared/ui';
import { queryKeys } from '@shared/query/queryKeys';
import { formatDayLabel } from '@shared/utils/formatters';
import { store, type SourceKind } from '@services/db';
import { openChat } from '@features/chat';
import { useOpenMeeting } from '@features/history';
import { KNOWLEDGE_LIBRARY } from '@config/knowledgeLibrary.config';
import type { RelatedSource } from '@shared/types/native';

const { related: COPY } = KNOWLEDGE_LIBRARY;

const isKind = (kind: string): kind is SourceKind => kind in COPY.kinds;

interface RelatedSourcesProps {
  /** The document whose related sources these are. */
  id: string;
  /** Only once it is indexed: before, it has no vectors to compare. */
  ready: boolean;
  /** Opens another document in the library. */
  onOpenDocument: (id: string) => void;
}

export const RelatedSources: React.FC<RelatedSourcesProps> = ({ id, ready, onOpenDocument }) => {
  const openMeeting = useOpenMeeting();
  const { data: related = [] } = useQuery({
    queryKey: queryKeys.relatedSources('file', id),
    queryFn: () => store.sources.related('file', id, COPY.minScore, COPY.limit),
    enabled: ready,
  });
  if (related.length === 0) return null;

  const open = (source: RelatedSource) => {
    if (source.kind === 'meeting') void openMeeting({ id: source.id });
    else if (source.kind === 'chat') openChat(source.id);
    else onOpenDocument(source.id);
  };

  return (
    <Section title={COPY.title} footer={COPY.footer} className="shrink-0 py-4">
      {related.map((source) => (
        <CardRow
          key={`${source.kind}-${source.id}`}
          title={source.title}
          description={[isKind(source.kind) && COPY.kinds[source.kind], formatDayLabel(source.at)].filter(Boolean).join(' · ')}
          onOpen={() => open(source)}
        />
      ))}
    </Section>
  );
};
