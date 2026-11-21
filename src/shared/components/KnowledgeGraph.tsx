/** The knowledge graph — people, organizations, projects, events, topics, the meetings that discussed them and the memories
 *  about them — drawn whole or around one meeting. Selecting an entity shows what is known about it underneath; a meeting
 *  or a memory opens through the caller. */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network } from 'lucide-react';
import { CardRow, GraphView, Section } from '@shared/ui';
import { EmptyState } from '@shared/components/EmptyState';
import { knowledgeEntityQuery, knowledgeGraphQuery } from '@shared/query/knowledge';
import { KNOWLEDGE_GRAPH } from '@config/knowledge.config';
import { formatDate } from '@shared/utils/formatters';

const COPY = KNOWLEDGE_GRAPH.copy;

/** What is known about one entity: what the user approved, its relations (each from its meeting), the meetings, newest first. */
const EntityDetail: React.FC<{ id: string; onOpenMeeting: (id: string) => void }> = ({ id, onOpenMeeting }) => {
  const { data: detail } = useQuery(knowledgeEntityQuery(id));
  if (!detail) return null;
  const { entity, facts, relations, meetings } = detail;
  const titleOf = (meetingId: string) => meetings.find((m) => m.id === meetingId)?.title;
  return (
    <>
      {facts.length > 0 && (
        <Section title={`${entity.name} — ${COPY.known}`}>
          {facts.map((fact) => <CardRow key={fact} title={fact} />)}
        </Section>
      )}
      {relations.length > 0 && (
        <Section title={COPY.relations}>
          {relations.map((r) => (
            <CardRow
              key={`${r.relation}-${r.other}-${r.meeting_id}`}
              title={r.outgoing ? `${entity.name} ${r.relation} ${r.other}` : `${r.other} ${r.relation} ${entity.name}`}
              description={titleOf(r.meeting_id)}
            />
          ))}
        </Section>
      )}
      {meetings.length > 0 && (
        <Section title={`${entity.name} — ${COPY.meetings}`}>
          {meetings.map((m) => <CardRow key={m.id} title={m.title} description={formatDate(m.created_at)} onOpen={() => onOpenMeeting(m.id)} />)}
        </Section>
      )}
    </>
  );
};

export interface KnowledgeGraphProps {
  /** A meeting (or entity) to draw two links around; null draws the most central of everything. */
  focus: string | null;
  height: number;
  onOpenMeeting: (id: string) => void;
  /** A memory's node: opens it for editing (where memories edit). */
  onOpenMemory?: (id: string) => void;
}

export function KnowledgeGraph({ focus, height, onOpenMeeting, onOpenMemory }: KnowledgeGraphProps) {
  const { data } = useQuery(knowledgeGraphQuery(focus));
  const [selected, setSelected] = useState<string | null>(focus);
  if (!data) return null;
  if (data.nodes.length < 2) {
    return <EmptyState icon={Network} message={COPY.emptyTitle} description={focus ? COPY.emptyMeeting : COPY.emptyAll} />;
  }
  const kindOf = (id: string) => data.nodes.find((n) => n.id === id)?.kind;
  const select = (id: string | null) => {
    if (id && id !== focus && kindOf(id) === 'meeting') return onOpenMeeting(id);
    if (id && kindOf(id) === 'fact') return onOpenMemory?.(id);
    setSelected(id ?? focus);
  };
  const entity = selected && selected !== focus && kindOf(selected) !== 'meeting' ? selected : null;
  return (
    <>
      <Section>
        <GraphView
          nodes={data.nodes}
          edges={data.edges}
          kindTokens={KNOWLEDGE_GRAPH.kindTokens}
          smallKind={KNOWLEDGE_GRAPH.smallKind}
          quietRelations={KNOWLEDGE_GRAPH.quietRelations}
          legend={KNOWLEDGE_GRAPH.legend}
          selected={selected}
          onSelect={select}
          height={height}
          label={COPY.label}
        />
      </Section>
      {entity && <EntityDetail id={entity} onOpenMeeting={onOpenMeeting} />}
    </>
  );
}
