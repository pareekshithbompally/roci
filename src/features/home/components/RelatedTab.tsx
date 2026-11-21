/** A meeting's Related tab: the knowledge graph around it — who and what it discussed, the relations between them, and the
 *  other meetings that discussed them — then those meetings as a list with what they share (the graph in words). */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardRow, Section } from '@shared/ui';
import { KnowledgeGraph } from '@shared/components';
import { knowledgeGraphQuery } from '@shared/query/knowledge';
import { useOpenMeeting } from '@features/history';
import { KNOWLEDGE_GRAPH } from '@config/knowledge.config';
import { UI_CONFIG } from '@config/ui.config';
import type { GraphView } from '@shared/types/native';

const COPY = KNOWLEDGE_GRAPH.copy;
/** The link from a meeting to what it discussed, as the store names it. */
const DISCUSSED = 'discussed';

/** The other meetings in the view, most central first, each with the names it shares with `meetingId`. */
function alsoDiscussed(view: GraphView, meetingId: string): Array<{ id: string; title: string; shared: string[] }> {
  const names = new Map(view.nodes.map((n) => [n.id, n.label]));
  const discussed = (id: string) => new Set(view.edges.filter((e) => e.source === id && e.relation === DISCUSSED).map((e) => e.target));
  const mine = discussed(meetingId);
  return view.nodes
    .filter((n) => n.kind === 'meeting' && n.id !== meetingId)
    .map((n) => ({ id: n.id, title: n.label, shared: [...discussed(n.id)].filter((id) => mine.has(id)).map((id) => names.get(id) ?? '') }))
    .filter((m) => m.shared.length > 0);
}

export const RelatedTab: React.FC<{ meetingId: string }> = ({ meetingId }) => {
  const openMeeting = useOpenMeeting();
  const { data } = useQuery(knowledgeGraphQuery(meetingId));
  const related = data ? alsoDiscussed(data, meetingId) : [];
  const open = (id: string) => void openMeeting({ id });
  return (
    <>
      <KnowledgeGraph focus={meetingId} height={UI_CONFIG.graph.height.meeting} onOpenMeeting={open} />
      {related.length > 0 && (
        <Section title={COPY.alsoIn} footer={COPY.alsoInFooter}>
          {related.map((m) => <CardRow key={m.id} title={m.title} description={COPY.shared(m.shared)} onOpen={() => open(m.id)} />)}
        </Section>
      )}
    </>
  );
};
